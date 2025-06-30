import express from 'express';
import { ResourceTag } from '../../models/resourceTag.model.js';
import { createSession, getSession } from '../../services/sessionStore.js';
import ollama from 'ollama';
import { resourceConfigs } from '../../config/resourceConfig.js';

const router = express.Router();

// Schema definition with validation rules


// Enhanced query builder
const buildQuery = (operation, data, session) => {
    console.log('[QUERY] Building', operation, 'query with data:', JSON.stringify(data, null, 2));

    const base = {
        collection: 'resourcetags',
        operation: operation.toLowerCase(),
        session: session.id,
        timestamp: new Date().toISOString()
    };

    let values = [];

    if (data?.type != 'config' && (data?.values || data?.fields)) {
        values = Object.entries(data?.values || data?.fields || {}).map(([fieldName, value]) => ({
            fieldName,
            value
        }));
    }


    switch (operation.toLowerCase()) {
        case 'create':
            return {
                ...base,
                operation: 'insertOne',
                document: sanitizeData({ name: (data.name || data.resourceName), ...data, values }),
                options: { validateBeforeSave: false }
            };

        case 'read':
            return {
                ...base,
                operation: 'find',
                filter: buildFilter(data, session),
                options: { lean: true }
            };

        case 'update':
            if (!data._id) throw new Error('Update requires _id');
            return {
                ...base,
                operation: 'updateOne',
                filter: { _id: data._id, isDeleted: false },
                update: { $set: sanitizeData({ ...data, values }) },
                options: { runValidators: true }
            };

        case 'delete':
            return {
                ...base,
                filter: { _id: data._id },
                update: { $set: { isDeleted: true } },
                options: { new: true }
            };

        default:
            throw new Error(`Unsupported operation: ${operation}`);
    }
};

// Helper functions
const buildFilter = (data, session) => ({
    ...(data._id ? { _id: data._id } : {}),
    ...(data.type ? { type: data.type } : {}),
    isDeleted: false,
    ...session.partialFilter || {}
});

const sanitizeData = (data, operation) => {
    const sanitized = { ...data };
    // Operation-specific sanitization
    if (operation === 'create') {
        delete sanitized._id;
        delete sanitized.createdAt;
    }
    // General sanitization
    Object.keys(sanitized).forEach(key => {
        if (sanitized[key] === '') sanitized[key] = null;
        if (Array.isArray(sanitized[key]) && sanitized[key].length === 0)
            delete sanitized[key];
    });
    return sanitized;
};

// AI Prompt Construction
const buildSystemPrompt = (session) => {

    let schemaResource = session.resourceType == 'config' ? resourceConfigs.configSchema : resourceConfigs.resourceSchema

    const context = {
        schema: schemaResource,
        collectedData: session.partialData,
        requiredFields: schemaResource.required.filter(
            f => !session.confirmedFields.includes(f)
        ),
        lastOperation: session.history
            .slice()
            .reverse()
            .find(m => m.role === 'assistant' && m.content.includes('operation'))
    };

    return `[SYSTEM ROLE]
You are a MongoDB CRUD assistant with these responsibilities:

1. SCHEMA AWARENESS:
- Current Resource: ${session.name}
- Required Fields: ${context.requiredFields.join(', ')}
- Collected Data: ${JSON.stringify(context.collectedData)}

2. OPERATION RULES:
- create: Must include all required fields
- update: Must specify target resource ID
- read: Can filter by any schema field
- delete: Soft-delete by default

3. RESPONSE FORMAT:
{
  "intent": "<operation_type>",
  "data": { /* extracted fields */ },
  "query": { /* MongoDB query */ },
  "confirm": boolean,
  "followup": "Next question",
  "validation": { /* missing/incorrect fields */ }
}

4. CONVERSATION FLOW:
${session.history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}
[/SYSTEM]`;
};

// Main endpoint
router.post('/', async (req, res) => {
    const { message, sessionId } = req.body;
    const session = getSession(sessionId) || createSession(sessionId);

    try {
        // Add to conversation history
        session.history.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });

        // Get AI response
        const response = await ollama.chat({
            model: 'mongoai',
            messages: [
                { role: 'system', content: buildSystemPrompt(session) },
                ...session.history.slice(-3).map(m => ({
                    role: m.role,
                    content: typeof m.content === 'object' ?
                        JSON.stringify(m.content) : m.content
                }))
            ],
            format: 'json',
            options: {
                temperature: 0.3,
                num_ctx: 4096,
                repeat_penalty: 1.2
            }
        });

        // Parse and validate response
        const aiResponse = validateAIResponse(
            JSON.parse(response.message.content)
        );

        // Build precise query
        const query = buildQuery(
            aiResponse.intent,
            aiResponse.data,
            { session }
        );
        console.log(query, 'QUERYYY')

        // Update session
        session.partialData = { ...session.partialData, ...aiResponse.data };
        session.latestQuery = query;
        session.history.push({
            role: 'assistant',
            content: response.message.content
        });

        // Handle response
        if (aiResponse.confirm) {
            return res.json({
                ...aiResponse,
                system_action: 'awaiting_confirmation',
                query_preview: query
            });
        }



        res.json({
            ...aiResponse,
            query_preview: query,
            sessionId: session.id
        });

    } catch (error) {
        console.error('Conversation error:', error);
        res.status(500).json({
            followup: "I encountered an issue. Let me rephrase...",
            status: "error",
            details: error.message
        });
    }
});

router.post('/confirm', async (req, res) => {
    console.log('\n[CONFIRM] Processing confirmation:', req.body);
    const { sessionId, confirm } = req.body;
    const session = getSession(sessionId);

    try {

        if (!session) {
            console.error('[ERROR] Session not found:', sessionId);
            return res.status(404).json({ error: "Session expired" });
        }

        if (!confirm) {
            console.log('[CANCEL] User declined operation');
            session.history.push({
                role: 'user',
                content: 'Operation canceled'
            });
            return res.json({
                followup: "Operation canceled. What would you like to do instead?"
            });
        }

        // Execute the stored query
        console.log('[EXECUTE] Running query:', JSON.stringify(session.latestQuery, null, 2));
        const result = await executeDbOperation(session.latestQuery);

        console.log('[SUCCESS] Operation completed:', {
            operation: session.latestQuery.operation,
            result: result
        });

        // Clear session state
        session.partialData = {};
        session.confirmedFields = [];
        session.history.push({
            role: 'system',
            content: `Operation ${session.latestQuery.operation} completed`
        });

        res.json({
            status: 'completed',
            result: result,
            followup: "Operation successful. What would you like to do next?"
        });

    } catch (error) {
        console.error('[ERROR] Confirmation failed:', {
            error: error.message,
            query: session?.latestQuery,
            time: new Date().toISOString()
        });

        res.status(500).json({
            error: "Operation failed",
            details: error.message,
            followup: "Let me help you correct this..."
        });
    }
});

const validateResourceTag = (operation, data) => {
    const errors = [];

    // Common validation for both insert and update
    if (!data.type) {
        errors.push('Type field is required');
    }

    // Operation-specific validation
    if (operation === 'insertOne' && !data.name) {
        errors.push('Name field is required for creation');
    }

    if (operation === 'updateOne' && !data._id) {
        errors.push('Document _id is required for updates');
    }

    if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
    }

    return {
        ...data,
        name: data.name?.trim() || undefined // Clean whitespace
    };
};

// CRUD Operations
const executeDbOperation = async (query) => {
    try {
        // Validate before execution
        const validatedData = validateResourceTag(query.operation, query.document || query.update?.$set);

        switch (query.operation) {
            case 'insertOne':
                const created = await ResourceTag.create({
                    ...validatedData,
                    createdAt: new Date()
                });
                return {
                    operation: 'create',
                    acknowledged: true,
                    insertedId: created._id
                };

            case 'updateOne':
                const updated = await ResourceTag.findOneAndUpdate(
                    query.filter,
                    { $set: validatedData },
                    { new: true, runValidators: true }
                );
                return {
                    operation: 'update',
                    acknowledged: true,
                    matchedCount: updated ? 1 : 0
                };

            default:
                throw new Error(`Unsupported operation: ${query.operation}`);
        }
    } catch (error) {
        console.error('Database operation failed:', {
            operation: query.operation,
            error: error.message,
            stack: error.stack
        });
        throw new Error(`Database error: ${error.message}`);
    }
};

// Validation helpers
const validateAIResponse = (response) => {
    const requiredFields = ['intent', 'data', 'confirm'];
    requiredFields.forEach(field => {
        if (!(field in response)) {
            throw new Error(`AI response missing required field: ${field}`);
        }
    });

    if (!['create', 'read', 'update', 'delete'].includes(response.intent)) {
        throw new Error(`Invalid operation intent: ${response.intent}`);
    }

    return response;
};

export default router;