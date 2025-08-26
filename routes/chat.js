import express from 'express';
import { db } from '../models/index.js';
import aiService from '../services/aiServices.js';
import { executeTemplate, getActionTemplates, handleCreate, handleRead } from '../services/ActionTemplateService.js';
import { sessionManager } from '../services/sessionStore.js';
import { processActionPrompt, processTemplatePrompt } from '../services/ollamaService.js';
import Redis from 'ioredis';
import { confirmOperation } from '../helpers/ollamaHelpers.js';
import { ActionEngine } from '../services/ActionEngine.js';
import { ActionService } from '../services/ActionTriggerService.js';
import { AIAgent } from '../services/aiAgent.js';
import { Op } from 'sequelize';

const actionEngine = new ActionEngine();


const router = express.Router();


// 2. Redis Session Store
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const SESSION_TTL = 60 * 60 * 2; // 2 hours

// Store conversation state in memory (for production use Redis)



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
                `No action allowed to process: ${message}`,
                'No Action template!'
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


        if (action.trigger_type !== 'IMMEDIATE') {
            const trigger = await db.ActionTrigger.create({
                ...req.body,
                trigger_config: action.trigger_config,
                trigger_type: action.trigger_type,
                action_template_id: action.template.id,
                tool_type: action.template.tool_type,
                parameters: actionTemplate.parameters
            });



            result = await ActionService.scheduleTrigger(trigger);
            return res.status(200).json({
                result,
                message: `${action.trigger_type} Action Executed!`
            })
        } else {
            // this.executeImmediately(trigger);
            console.log(action, actionTemplate, 'trrrr immed')
            result = await actionEngine.execute(
                action.template,
                actionTemplate.parameters
            );

            return res.status(200).json({
                result,
                message: 'Immediate Action Executed!'
            })
        }

        // return res.status(200).json({ message: 'Success', actionTemplate, action, session });


    } catch (error) {
        console.log(error, 'ERRRR')

        const formattedResponse = await aiService.formatResultsForUser(
            [],
            message,
            'Error Response'
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
        return res.status(500).json({ error: error.message });
    }
});

router.post('/preset/:id', async (req, res) => {
    const modelId = req.params.id;
    const { message, conversation_id, options } = req.body;

    let session = await sessionManager.getSession(conversation_id);



    try {

        if (!session) {
            console.log('[Session] Creating new session');
            session = await sessionManager.createSession(conversation_id);

        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }



        session.ai_preset_id = modelId;
        sessionManager.updateSession(session.id, session)




        console.log(session, 'SESSH', modelId)


        const agent = new AIAgent(session.ai_preset_id, session.conversation_id);

        await agent.initialize(session.context);

        console.log('[MESSAGE] Processing user input...');
        const response = await agent.generate(message, options);


        console.log('[AI MESSAGE] response...', response);
        return res.status(200).json({
            // message: formattedResponse,
            data: response,
            session: session,
            sessionId: session.id,
            // action: ollamaResponse
        });
    } catch (error) {
        console.log(error, 'ERRR')
        res.status(500).json({ error: error.message });
    }
});

router.get('/train/:id', async (req, res) => {
    const messageId = req.params.id;



    try {

        if (!messageId) {
            return res.status(400).json({ error: "Missing message id." });
        }

        const message = await db.Message.findAll({ where: { treadId: messageId } });

        if (message.length < 2) {
            return res.status(404).json({
                error: `Tread with id ${messageId} not found.`
            });
        }




        const trained = await db.Message.update({ is_training_candidate: !message[0].is_training_candidate }, {
            where: { treadId: messageId }
        });




        return res.status(200).json({
            message: 'Trained Successfully',
            data: trained
        });



        /*     return res.status(200).json({
                // message: formattedResponse,
                data: response,
                session: session,
                sessionId: session.id,
                // action: ollamaResponse
            }); */
    } catch (error) {
        console.log(error, 'ERRR')
        res.status(500).json({ error: error.message });
    }
});

router.get('/preset/:id', async (req, res) => {
    const modelId = req.params.id;
    const conversation_id = req.query.conversation_id
    const is_liked = req.query.liked;

    let session = await sessionManager.getSession(conversation_id);



    console.log(session, 'sssssss', modelId)
    try {


        if (!session) {
            console.log('[Session] Creating new session');
            session = await sessionManager.createSession(conversation_id);
            session.ai_preset_id = modelId;
            sessionManager.updateSession(session.id, session)

        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }





        const { page = 1, limit = 20, sort = 'DESC' } = req.query;
        const offset = (page - 1) * limit;

        const result = await db.Message.findAndCountAll({
            limit: parseInt(limit),
            order: [['created_at', sort]],
            offset: parseInt(offset),
            where: { ai_preset_id: req.params.id, role: { [Op.or]: ["user", "assistant"] }, ...(is_liked == 'true' ? { is_training_candidate: is_liked } : {}) }
        });


        console.log(Boolean(is_liked), 'liiked', is_liked == 'true', { ...(is_liked == 'true' ? { is_training_candidate: is_liked } : {}) })
        res.status(200).json({
            data: result.rows,
            meta: {
                total: result.count,
                page: parseInt(page),
                totalPages: Math.ceil(result.count / limit)
            }
        });



        /*     return res.status(200).json({
                // message: formattedResponse,
                data: response,
                session: session,
                sessionId: session.id,
                // action: ollamaResponse
            }); */
    } catch (error) {
        console.log(error, 'ERRR')
        res.status(500).json({ error: error.message });
    }
});

router.delete('/preset/:id', async (req, res) => {
    const messageId = req.params.id;



    try {

        if (!messageId) {
            return res.status(400).json({ error: "Missing message id." });
        }


        const deleted = await db.Message.destroy({
            where: { id: messageId }
        });




        return res.status(200).json({
            message: 'Deleted Successfully',
            data: deleted
        });



        /*     return res.status(200).json({
                // message: formattedResponse,
                data: response,
                session: session,
                sessionId: session.id,
                // action: ollamaResponse
            }); */
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

// Update - PUT /presets/:id
router.put('/message/:id', async (req, res) => {
    const { content } = req.body;

    try {


        let contentToSave = content;

        // Only attempt to parse if content is a string
        if (typeof content === 'string') {
            try {
                contentToSave = JSON.parse(content);
            } catch (e) {
                // Parsing failed, keep original content
            }
        }

        const [affectedRows] = await db.Message.update(
            { content: contentToSave },
            {
                where: { id: req.params.id },
                individualHooks: true,
            }
        );


        if (affectedRows === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }

        const updatedPreset = await db.Message.findByPk(req.params.id);
        // await ModelDeployer.deployModel(updatedPreset.id, t);

        return res.json({ message: 'Message updated successfully', data: updatedPreset });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});


export default router;