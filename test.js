// app.js
import express from 'express';
import bodyParser from 'body-parser';
import { Sequelize, DataTypes } from 'sequelize';
import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(bodyParser.json());

// Configure Sequelize with PostgreSQL using environment variables
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: process.env.NODE_ENV === 'development'
            ? console.log
            : false
    }
);

// ResourceTag Model Definition
const ResourceTag = sequelize.define('ResourceTag', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    type: {
        type: DataTypes.ENUM('resource', 'config', 'connections'),
        allowNull: false,
        defaultValue: 'resource'
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Unique identifier for the resource'
    },
    attributes: {
        type: DataTypes.JSONB,
        description: "Resource data object containing dynamic properties"
    },
    resource_parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Reference to parent resource if hierarchical'
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Soft delete flag'
    },
    ai_description: {
        type: DataTypes.TEXT,
        description: "Natural language description for AI context"
    },
    ai_example_queries: {
        type: DataTypes.JSONB,
        description: "Example natural language queries for this resource"
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: 'Creation timestamp'
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: 'Last update timestamp'
    }
}, {
    tableName: 'resource_tags',
    timestamps: false,
    indexes: [
        { fields: ['type', 'name'], name: 'resource_tags_type_name_idx' },
        { fields: ['resource_parent_id'], name: 'resource_tags_parent_idx' }
    ],
    comment: 'Central resource repository with AI metadata'
});

// Allowed operators for safe query construction
const ALLOWED_OPERATORS = [
    '$eq', '$ne', '$gt', '$gte', '$lt', '$lte',
    '$in', '$like', '$and', '$or', '$not',
    '$iLike', '$between', '$notBetween', '$contains'
];

// Session-based conversation history store
const conversationHistory = new Map();

// Get allowed fields from model definition
function getAllowedFields() {
    try {
        const excludedFields = ['attributes', 'ai_example_queries'];
        const baseFields = Object.keys(ResourceTag.rawAttributes)
            .filter(field => !excludedFields.includes(field));

        return [
            ...baseFields,
            'attributes.*' // Wildcard for JSONB attributes
        ];
    } catch (error) {
        console.error('Failed to get allowed fields:', error);
        return []; // Fail-safe return
    }
}

/**
 * Validate generated query filter against security constraints
 * @param {Object} filter - Sequelize where clause
 * @returns {boolean} - True if valid, false otherwise
 */
function validateFilter(filter) {
    if (!filter || typeof filter !== 'object') {
        console.warn('Empty or invalid filter received');
        return false;
    }

    const allowedFields = getAllowedFields();

    function validateNode(node) {
        for (const [key, value] of Object.entries(node)) {
            // Validate operators
            if (key.startsWith('$')) {
                if (!ALLOWED_OPERATORS.includes(key)) {
                    console.warn(`Disallowed operator detected: ${key}`);
                    return false;
                }

                // Recursively validate operator values
                if (Array.isArray(value)) {
                    for (const item of value) {
                        if (typeof item === 'object' && !validateNode(item)) {
                            return false;
                        }
                    }
                } else if (typeof value === 'object' && !validateNode(value)) {
                    return false;
                }
                continue;
            }

            // Validate field paths
            const isAttributePath = key.startsWith('attributes.');
            const isBaseField = allowedFields.includes(key);

            if (!isBaseField && !isAttributePath) {
                console.warn(`Disallowed field detected: ${key}`);
                return false;
            }

            // Validate JSONB attribute keys
            if (isAttributePath) {
                const attrKey = key.split('.')[1];
                if (!attrKey || !/^[a-zA-Z_][\w-]*$/.test(attrKey)) {
                    console.warn(`Invalid attribute key: ${attrKey}`);
                    return false;
                }
            }

            // Recursively validate nested objects
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                if (!validateNode(value)) return false;
            }
        }
        return true;
    }

    return validateNode(filter);
}

/**
 * Generate Sequelize filter using Ollama's Mistral model
 * @param {string} prompt - User query
 * @param {Array} history - Conversation history
 * @returns {Promise<{filter: Object, explanation: string}>} - Generated query
 */
async function generateQuery(prompt, history) {
    const allowedFields = getAllowedFields();
    const currentDate = new Date().toISOString().split('T')[0];

    const systemMessage = {
        role: 'system',
        content: `## ROLE: Sequelize Query Generator
## RESOURCE STRUCTURE:
${Object.entries(ResourceTag.rawAttributes)
                .map(([field, config]) => `- ${field} (${config.type.key})`)
                .join('\n')}

## RULES:
1. ONLY use fields: ${allowedFields.join(', ')}
2. USE operators: ${ALLOWED_OPERATORS.join(', ')}
3. JSONB attributes MUST use dot notation (attributes.key)
4. OUTPUT JSON: { "filter": {...}, "explanation": "text" }
5. CURRENT DATE: ${currentDate}
6. IMPLICIT is_deleted=false UNLESS specified otherwise
7. DATE FORMAT: YYYY-MM-DD

## EXAMPLES:
Prompt: "Active config resources created this year"
Output: {
  "filter": {
    "type": "config",
    "is_deleted": false,
    "created_at": { "$gt": "${new Date().getFullYear() - 1}-12-31" }
  },
  "explanation": "Non-deleted config resources from current year"
}

Prompt: "Resources with priority > 5 and status 'active'"
Output: {
  "filter": {
    "$and": [
      { "attributes.priority": { "$gt": 5 } },
      { "attributes.status": "active" }
    ]
  },
  "explanation": "Resources with high priority and active status"
}`
    };

    const messages = [systemMessage, ...history, { role: 'user', content: prompt }];

    try {
        console.log(`Sending to Ollama: ${prompt}`);
        const response = await axios.post(
            process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat',
            {
                model: 'mistral',
                messages,
                format: 'json',
                stream: false,
                options: {
                    temperature: 0.3,
                    num_ctx: 4096
                }
            },
            { timeout: 30000 } // 30-second timeout
        );

        console.log('Received Ollama response');
        const content = response.data.message.content;

        try {
            return JSON.parse(content);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            console.error('Original content:', content);
            return { filter: {}, explanation: 'Invalid JSON response from AI' };
        }
    } catch (error) {
        console.error('Ollama API error:', error.response?.data || error.message);
        return { filter: {}, explanation: 'AI service unavailable' };
    }
}

/**
 * Query endpoint handler
 * POST /api/v1/query
 * Body: { prompt: string, sessionId: string }
 */
app.post('/api/v1/query', async (req, res) => {
    const { prompt, sessionId } = req.body;

    // Validate input
    if (!prompt || !sessionId) {
        console.warn('Missing parameters in request');
        return res.status(400).json({
            error: 'Both prompt and sessionId are required'
        });
    }

    console.log(`New query: [${sessionId}] "${prompt}"`);

    try {
        // Retrieve conversation history
        const history = conversationHistory.get(sessionId) || [];
        console.log(`History for session ${sessionId}: ${history.length} entries`);

        // Generate query using AI
        const { filter, explanation } = await generateQuery(prompt, history);
        console.log('Generated filter:', JSON.stringify(filter, null, 2));

        // Security validation
        if (!validateFilter(filter)) {
            console.warn('Filter validation failed');
            return res.status(400).json({
                error: 'Invalid query structure',
                explanation: explanation || 'Security validation failed',
                filter
            });
        }

        // Add soft-delete filter if not explicitly set
        const finalFilter = { ...filter };
        if (finalFilter.is_deleted === undefined) {
            finalFilter.is_deleted = false;
        }

        // Execute database query
        console.log('Executing query with filter:', JSON.stringify(finalFilter));
        const results = await ResourceTag.findAll({ where: finalFilter });
        console.log(`Found ${results.length} records`);

        // Update conversation history (limit to last 10 exchanges)
        const newHistory = [
            ...history,
            { role: 'user', content: prompt },
            {
                role: 'assistant',
                content: JSON.stringify({
                    filter: finalFilter,
                    explanation,
                    resultsCount: results.length
                })
            }
        ].slice(-10); // Maintain last 5 exchanges (user+assistant pairs)

        conversationHistory.set(sessionId, newHistory);

        // Format response
        res.json({
            success: true,
            data: results,
            explanation,
            filter: finalFilter,
            resultsCount: results.length,
            history: newHistory.map(entry => ({
                role: entry.role,
                content: entry.role === 'assistant'
                    ? JSON.parse(entry.content)
                    : entry.content
            }))
        });

    } catch (error) {
        console.error('Query processing error:', error);
        res.status(500).json({
            error: 'Query processing failed',
            details: process.env.NODE_ENV === 'development'
                ? error.message
                : 'Internal server error'
        });
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        db: sequelize.authenticate() ? 'connected' : 'disconnected',
        memory: process.memoryUsage().rss,
        sessions: conversationHistory.size
    });
});

// Database connection and server startup
sequelize.authenticate()
    .then(() => {
        console.log('Database connection established');

        // Sync model with database
        return sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    })
    .then(() => {
        const PORT = process.env.PORT || 3300;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Ollama endpoint: ${process.env.OLLAMA_URL || 'default'}`);
        });
    })
    .catch(err => {
        console.error('Database initialization failed:', err);
        process.exit(1);
    });