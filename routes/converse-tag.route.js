import express from 'express';
import { ResourceTag } from '../models/resourceTag.model.js';
import { createSession, getSession } from '../services/sessionStore.js';
import ollama from 'ollama';
import { resourceConfigs } from '../config/resourceConfig.js';
import { extractOrganization, extractResourceName } from '../utils/helpers.js';
import { findResourceByName, getOrganizations, getResourceTypes } from '../services/resourceService.js';

const router = express.Router();

// Configuration Constants

// ========================
// Core Business Logic
// ========================

const buildSystemPrompt = (session) => {
    console.log('[PROMPT] Building system prompt for session:', session);

    // const context = {
    //     schema: resourceConfigs.resourceSchema,
    //     collected: Object.keys(session.partialData),
    //     required: ['type', 'name'].filter(f => !session.confirmedFields.includes(f)),
    //     lastOp: session.history.slice(-3).find(m => m.role === 'assistant')
    // };


    let isConfig = session?.partialData?.type == 'config' ? true : false;
    let requiredFields = [];

    if (session.confirmedFields && session.confirmedFields.length) {
        requiredFields = session.confirmedFields.map(a => a.fieldName);
    }


    console.log(isConfig, 'IS CONFIG?', requiredFields)
    const context = {
        schema: resourceConfigs.resourceSchema,
        organization: session?.organizations,
        name: session?.resourceName,
        type: session?.resourceType,
        collectedData: { resourceName: session.resourceName, resourceType: session.resourceType, ...session.partialData },
        requiredFields: ['resourceName', 'resourceType', ...(isConfig ? ['fields.fieldName', 'fields.dataType'] : ['values'])].filter(
            f => !session.confirmedFields.includes(f)
        ),
        lastOperation: session.history
            .slice()
            .reverse()
            .find(m => m.role === 'assistant' && m.content.includes('operation'))
    };

    console.log(context, 'CONTEXT')

    return `[SYSTEM ROLE]
You are a MongoDB CRUD assistant with these responsibilities:



1. SCHEMA:
- Current Resource Name: ${context.name}
- Required Fields: ${requiredFields.join(', ')}
- Collected Data: ${JSON.stringify(context.collectedData)}



2. OPERATION TYPE and RULES:
- create: Must include all required fields
- update: Must specify target resource ID
- read: Can filter by any schema field
- delete: Soft-delete by default

3. RESPONSE FORMAT:
{
  "intent": "<operation_type>",
  "data": {
     "resourceName": "${context.name}",
  .../* extracted fields */
  },
  "query": { /* MongoDB query */ },
  "confirm": boolean,
  "followup": "<Next Question>",
  "validation": { /* missing/incorrect fields */ }
}

4. FIELDS OPTIONS
-resourceType: ['config', 'resource', 'connections']
-intent: ['create', 'update', 'read', 'delete']

5. CONVERSATION FLOW:
${session.history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}
[/SYSTEM]`;
};

const buildQuery = (operation, data, session) => {
    console.log('[QUERY] Building', operation, 'query with data:', JSON.stringify(data, null, 2));

    const base = {
        collection: 'ResourceTag',
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
                document: sanitizeData({ name: data.resourceName, ...data, values }),
                options: { validateBeforeSave: true }
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

// ========================
// Helper Functions
// ========================

const sanitizeData = (data) => {
    const sanitized = { ...data };
    delete sanitized._id;
    delete sanitized.__v;



    console.log('[SANITIZE] Before:', data, 'After:', sanitized);
    return sanitized;
};

const buildFilter = (data, session) => {
    const filter = {
        ...(data._id && { _id: data._id }),
        ...(data.type && { type: data.type }),
        isDeleted: false
    };

    console.log('[FILTER] Built filter:', JSON.stringify(filter, null, 2));
    return filter;
};

async function handleResourceSelection(prompt, session) {
    const updates = {};
    let followUp;
    console.log(prompt, session, 'init resource')
    const orgs = await getOrganizations();
    const resrcs = await getResourceTypes();


    if (!session.organization) {
        const { value, feedback, suggestions } = await extractOrganization(prompt);
        console.log(orgs, 'orgss', value, feedback, suggestions)
        if (value) {
            updates.organization = value;
            followUp = `${feedback}\nWhich resource in ${value}?`;
        } else {
            followUp = `${feedback}\nAvailable organizations: ${orgs.join(', ')}` +
                (suggestions?.length ? `\nDid you mean: ${suggestions.join(', ')}` : '');
        }
    }

    else if (!session.resourceName) {
        const { value, feedback, confidence } = await extractResourceName(prompt, resrcs);

        console.log(resrcs, 'rsrcs', value, feedback, confidence)
        let resource = await findResourceByName(value)
        console.log(resource, 'rrssss')

        if (value) {
            updates.requiredFields = resource?.fields
            updates.resourceName = value;
            followUp = `${feedback}\nWhat action for ${value}? (create/get/update/delete)`;
        } else {
            followUp = `${feedback}\nAvailable resources: ${resrcs.join(', ')}`;
        }
    }

    // const updatedSession = await sessionStore.updateSession(session._id, {
    //     ...updates,
    //     userInput: prompt,
    //     followUp
    // });

    console.log({
        updates,
        sessionId: session._id,
        // ...updatedSession.state,
        followUp,
        requiresInput: !updates.organization || !updates.resourceName
    }, 'BUILD RESOURCE')

    return {
        sessionId: session._id,
        // ...updatedSession.state,
        ...updates,
        followUp,
        requiresInput: !updates.organization || !updates.resourceName,
    };
}


// ========================
// API Endpoints
// ========================

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

        console.log(session, 'SESSION STATE')

        // Handle initialization stage
        if (!session.organization || !session.resourceName) {
            const result = await handleResourceSelection(message, session);

            if (result.organization) {
                session.organization = result.organization;
            }
            if (result.resourceName) {
                session.resourceName = result.resourceName;
            }
            if (result.requiredFields) {
                session.confirmedFields = result.requiredFields
            }

            // session.history.push({
            //     role: 'assistant',
            //     content: result.followUp
            // });

            // return res.json(result);
        }



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


        console.log(JSON.parse(response.message.content), 'airesponse')

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
        console.log('Conversation error:', error);
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
        const result = await executeOperation(session.latestQuery);

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

// ========================
// Database Operations
// ========================

const executeOperation = async (query) => {
    console.log('[DB] Executing:', {
        operation: query.operation,
        collection: query.collection,
        timestamp: query.timestamp
    });

    try {
        switch (query.operation) {
            case 'insertOne':
                console.log('[DB] Creating document:', query.document);
                return await ResourceTag.create(query.document, query.options);

            case 'find':
                console.log('[DB] Finding with filter:', query.filter);
                return await ResourceTag.find(query.filter)
                    .setOptions(query.options);

            case 'updateOne':
                console.log('[DB] Updating:', {
                    filter: query.filter,
                    update: query.update
                });
                return await ResourceTag.findOneAndUpdate(
                    query.filter,
                    query.update,
                    query.options
                );

            case 'delete':
                console.log('[DB] Soft deleting:', query.filter);
                return await ResourceTag.findOneAndUpdate(
                    query.filter,
                    query.update,
                    query.options
                );

            default:
                throw new Error(`Unsupported operation: ${query.operation}`);
        }
    } catch (error) {
        console.error('[DB] Operation failed:', {
            error: error.message,
            query: JSON.stringify(query, null, 2),
            stack: error.stack
        });
        throw error;
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


    console.log(response, 'validate response')
    if (!['create', 'read', 'update', 'delete'].includes(response.intent)) {
        throw new Error(`Invalid operation intent: ${response.intent}`);
    }

    return response;
};

export default router;