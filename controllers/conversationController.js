import { ConversationProcessor } from '../services/ConversationProcessor.js';
import { generateQueryWithConfig, resourceConfig } from '../services/ollamaService.js';
import {
    extractOrganization,
    extractResourceName,
    detectAction,
    generateSessionId
} from '../utils/helpers.js';
import { findResourceByName, getOrganizations, getResourceTypes } from '../services/resourceService.js';
import { sessionStore } from '../utils/session.js';

const processor = new ConversationProcessor();

export const handleChat = async (req, res) => {
    try {
        const { prompt, sessionId } = req.body;

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Valid prompt is required' });
        }

        const result = await processor.process(prompt, sessionId);

        // Handle confirmation responses
        if (result.status === 'confirmation' &&
            prompt.trim().toUpperCase() === 'YES') {
            result.status = 'complete';
            result.message = 'Order confirmed! Your delivery is being processed.';
        }

        res.json(result);

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Processing failed',
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
};

export const queryResource = async (req, res) => {
    const { prompt, sessionId = generateSessionId() } = req.body;

    try {
        // Get or initialize session
        let session = await sessionStore.getSession(sessionId);
        console.log(prompt, sessionId, 'SEle', session)
        if (!session) {
            console.log('initt')
            session = await sessionStore.initSession(sessionId);
        }

        console.log(prompt, sessionId, 'SEle RESSID', session)

        // Handle core operation
        const { action } = session;







        // If no action specified yet
        if (!action) {
            const newAction = detectAction(prompt);
            if (!newAction) {
                return res.json({
                    sessionId: session._id,
                    stage: 'action-required',
                    followUp: `What would you like to do with ${session.resourceName}? ` +
                        `(create/get/update/delete)`
                });
            }
            sessionStore.updateSession(session._id, { action: newAction });
        }


        // Handle initialization stage
        if (!session.state.organization || !session.state.resourceName) {
            const result = await handleResourceSelection(prompt, session);


            return res.json(result);
        }


        // Generate query with session context
        const { method, data, query, confidence, missingFields, followup, summary } =
            await generateQueryWithConfig(prompt, session);



        // Handle missing fields
        if (missingFields?.length > 0) {
            sessionStore.updateSession(session._id, {
                ...session, state: { ...session.state, method, data, query, confidence, missingFields, followup, summary }
            });

            return res.json({
                sessionId: session._id,
                followUp: followup,
                collectedData: session.state.collectedData,
                method, data, query, confidence, missingFields
            });
        }

        // Handle confirmation
        if (!session?.state.confirmed) {
            return res.json({
                query,
                sessionId: session._id,
                stage: 'confirmation',
                method,
                summary,
                confidence,
                followUp: `Confirm ${method} operation on ${session.state.resourceName}?`,
                data
            });
        }




        // Execute operation
        const result = await executeOperation(method, data, query);


        // Log successful operation
        if (result.stage === 'completed') {
            await sessionStore.logOperation(sessionId, {
                action: result.method,
                resourceId: result.result._id,
                values: result.data,
                notes: `Operation ${result.method} completed successfully`
            });
        }


        return res.json({
            sessionId: session._id,
            stage: 'completed',
            result,
            followUp: generateCompletionMessage(method, result)
        });


    } catch (error) {
        console.error(`Session ${sessionId} Error:`, error);

        // Log failed operation
        if (sessionId) {
            await sessionStore.logOperation(sessionId, {
                action: 'error',
                notes: `Operation failed: ${error.message}`
            });
        }

        res.status(400).json({
            success: false,
            error: error.message,
            followUp: "Let's try that again. Please check your input and try again."
        });
    }
};

async function handleResourceSelection(prompt, session) {
    const updates = {};
    let followUp;
    console.log(prompt, session, 'init resource')
    const orgs = await getOrganizations();
    const resrcs = await getResourceTypes();


    if (!session.state.organization) {
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

    else if (!session.state.resourceName) {
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

    const updatedSession = await sessionStore.updateSession(session._id, {
        ...updates,
        userInput: prompt,
        followUp
    });

    return {
        sessionId: session._id,
        ...updatedSession.state,
        followUp,
        requiresInput: !updates.organization || !updates.resourceName
    };
}

function generateCompletionMessage(method, result) {
    const baseMessages = {
        create: `Successfully created with ID ${result._id}`,
        get: `Found ${result.length} records`,
        update: `Updated ${result.modifiedCount} documents`,
        delete: `Deleted ${result.deletedCount} documents`
    };

    return baseMessages[method] || 'Operation completed successfully';
}

