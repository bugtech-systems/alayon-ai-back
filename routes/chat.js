import express from 'express';
import { db } from '../models/index.js';
import aiService from '../services/aiServices.js';
import { executeTemplate, getActionTemplates, handleCreate, handleRead } from '../services/ActionTemplateService.js';
import { voicespeak } from '../speak.js';
import { sessionManager } from '../services/sessionStore.js';
import { findActionTemplateByName, findResourceByName, getResourceTypes } from '../services/ResourceService.js';
import { findBestMatch, findMatchAction, processActionPrompt, processTemplatePrompt } from '../services/ollamaService.js';
import AgenticAIService from '../services/agenticService.js';
import actionTemplateService from '../services/ActionTemplateService1.js';
import Redis from 'ioredis';
import { processMessage, confirmOperation, switchModel, generateAIResponse } from '../helpers/ollamaHelpers.js';
import { ActionEngine } from '../services/ActionEngine.js';
import { ActionService } from '../services/ActionTriggerService.js';
import { parseTrigger } from '../services/TriggerParser.js';
import { AIAgent } from '../tuner/app/ai-agent.js';

const actionEngine = new ActionEngine();


const router = express.Router();


// 2. Redis Session Store
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const SESSION_TTL = 60 * 60 * 2; // 2 hours

// Store conversation state in memory (for production use Redis)


const agenticService = new AgenticAIService(db);

// Enhanced AI Service with All Features


router.post('/alayon', async (req, res) => {
    // const { voice } = req.query;
    let voice = false;
    const { message, conversation_id } = req.body;
    let session = await sessionManager.getSession(conversation_id);
    let result = null;
    // let session = sessionManager.getSession('session_420230');


    try {

        if (!session) {
            console.log('[Session] Creating new session');
            session = await sessionManager.createSession(conversation_id);
        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }


        let action = await processActionPrompt(message, session)
        if (!action.selected_template) {
            const formattedResponse = await aiService.formatResultsForUser(
                [],
                message,
                action.error
            );

            return res.status(400).json({
                success: false,
                message: formattedResponse,
                session,
            });

        } else if (action) {
            session.template = action.template;
            session.resource_type = action.resource_type;
            session.resource_name = action.resource_name;
        }





        let actionTemplate = await processTemplatePrompt(message, session)

        sessionManager.updateSession(session.id, session)


        let trgr = parseTrigger(message);
        console.log(trgr, 'TRIGGER', action.template, actionTemplate)
        if (action.trigger_type !== 'IMMEDIATE') {
            const trigger = await db.ActionTrigger.create({
                ...req.body,
                action_template_id: action.template.id,
                tool_type: action.template.tool_type,
                parameters: req.body.parameters
            });

            result = await ActionService.scheduleTrigger(trigger);
            return res.status(200).json(result)
        } else {
            // this.executeImmediately(trigger);
            // console.log(action, actionTemplate, 'trrrr')
            result = await actionEngine.execute(
                action.template.id,
                actionTemplate.parameters
            );

            console.log(result, 'RESSS')
            return res.status(200).json(result)
        }

        // return res.status(200).json({ message: 'Success', actionTemplate, action, session });


    } catch (error) {
        console.log(error, 'ERRRR',
            error.details,
            error.message,
            error.name)

        const formattedResponse = await aiService.formatResultsForUser(
            [],
            message,
            error.message
        );

        return res.status(500).json({ message: formattedResponse });
    }
});

// API Endpoint
router.post('/detect-action', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: "Invalid input: 'text' field is required." });
        }

        let actionTemplates = await getActionTemplates();



        // Step 1: Build the Ollama prompt
        const actionPrompt = aiService.buildOllamaPrompt(actionTemplates.map(a => { return { name: a.name, description: a.description, action: a.action_type, resource: a.target_resource_type.name } }), message)

        console.log(actionPrompt, 'ACTION PROMPT')

        const ollamaResponse = await aiService.callOllama(actionPrompt);

        // Step 3: Parse and return the result
        let result;
        try {
            result = JSON.parse(ollamaResponse[0].text.trim());
        } catch (e) {
            console.error("Failed to parse Ollama response:", ollamaResponse);
            result = { action: null, resource: null, reason: "Invalid response format from Ollama." };
        }

        res.json(result);

    } catch (error) {
        console.error("Server error:", error.message);
        res.status(500).json({ error: "Internal server error." });
    }
});


router.post('/conversation', async (req, res) => {

    const { message, conversation_id, modelId, actionId, context } = req.body;

    let session = await sessionManager.getSession(conversation_id);
    // let session = sessionManager.getSession('session_420230');



    console.log(session, 'sssssss')
    try {

        if (!session) {
            console.log('[Session] Creating new session');
            session = await sessionManager.createSession(conversation_id);
            session.ai_preset_id = modelId;
            sessionManager.updateSession(session.id, session)

        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }











        console.log(session, 'SESSH', actionId, modelId, session)


        const agent = new AIAgent(session.ai_preset_id, session.conversation_id);

        await agent.initialize(context);

        console.log('[MESSAGE] Processing user input...');
        const response = await agent.generate(message);





        // // const conversation = getConversation(conversation_id);
        // const response = await processMessage(message, session);

        // if (response && response.type == 'error') {

        //     const formattedResponse = await aiService.formatResultsForUser(
        //         [],
        //         response.message,
        //         `Provide short description of the action error.`
        //     );
        //     console.log(formattedResponse)
        //     return res.status(200).json({
        //         message: formattedResponse,
        //         response: response,
        //         session: session,
        //         sessionId: session.id,
        //         action: ollamaResponse
        //     });
        // }

        // if (response.needsConfirmation) {
        //     session.status = 'confirmation';
        //     session.lastMessage = message;
        // } else {
        //     session.status = 'followup'

        // }

        // updateConversation(conversationId, conversation);

        return res.status(200).json({
            // message: formattedResponse,
            response: response,
            session: session,
            sessionId: session.id,
            // action: ollamaResponse
        });
    } catch (error) {
        console.log(error, 'ERRR')
        res.status(500).json({ error: error.message });
    }
});

router.post('/confirm', async (req, res) => {
    const { conversation_id, confirmation } = req.body;

    try {
        let session = sessionManager.getSession(conversation_id);
        console.log(session, 'session')
        if (!session) throw new Error('No pending operation');

        // const conversation = getConversation(conversationId);
        const result = await confirmOperation(session, confirmation);
        // updateConversation(conversationId, conversation);
        sessionManager.updateSession(session.id, session)


        res.json({ message: result, sessionId: session.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


export default router;