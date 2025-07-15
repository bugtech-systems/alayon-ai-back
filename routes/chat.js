import express from 'express';
import { db } from '../models/index.js';
import aiService from '../services/aiServices.js';
import { executeTemplate, getActionTemplates, handleCreate, handleRead } from '../services/ActionTemplateService.js';
import { voicespeak } from '../speak.js';
import { sessionManager } from '../services/sessionStore.js';
import { findActionTemplateByName, findResourceByName, getResourceTypes } from '../services/ResourceService.js';
import { extractResourceName, objectToAIString, removeNullKeys } from '../helpers/helpers.js';
import { findBestMatch, findMatchAction } from '../services/ollamaService.js';
import AgenticAIService from '../services/agenticService.js';
import actionTemplateService from '../services/ActionTemplateService1.js';
import Redis from 'ioredis';
import axios from 'axios'
import ResourceApiService from '../services/ResourceApiService.js';
import { processMessage, confirmOperation, switchModel, generateAIResponse } from '../helpers/ollamaHelpers.js';

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
    let session = sessionManager.getSession(conversation_id);
    // let session = sessionManager.getSession('session_420230');

    let resourceData = [];
    let response = {
        message: "Sorry! Unable to process your request."
    }


    try {

        if (!session) {
            console.log('[Session] Creating new session');
            session = sessionManager.createSession(conversation_id);
        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }











        if (session.status == 'confirmation') {

            let { confirmed } = await actionTemplateService.checkConfirmation(message, session.query)

            if (confirmed) {
                response = await handleAIResponse(session, session.query);
                const formattedResponse = await aiService.formatResultsForUser(
                    [response],
                    session?.query?.actionSummary,
                    'Successfully Executed Action.'
                );
                session.status = '';

                if (voice) {
                    await voicespeak(formattedResponse);
                }
                return res.json({
                    message: formattedResponse,
                    session,
                    query: session.query

                });
            } else {
                session.status = 'followup';
            }
        }



        let actionTemplates = await getActionTemplates();



        // Step 1: Build the Ollama prompt
        const actionPrompt = aiService.buildOllamaPrompt(actionTemplates.map(a => { return { name: a.name, description: a.description, action: a.action_type, resource: a.target_resource_type.name } }), message)
        const ollamaResponse = await actionTemplateService.callOllama(actionPrompt, 'alayon_action', {});


        // Step 3: Parse and return the result
        let resultAction;
        try {
            resultAction = JSON.parse(ollamaResponse.trim());
        } catch (e) {
            console.error("Failed to parse Ollama response:", ollamaResponse);
            resultAction = { action: null, resource: null, reason: "Invalid response format from Ollama." };
        }




        if (resultAction.action == 'clear') {

            session = sessionManager.createSession(conversation_id);

            // sessionManager.updateSession(session.id, session);

            console.log(session, 'CLEARED')
            return res.json({
                message: `Great! Successfully cleared context.`,
                session: session,
                sessionId: session.id,
                action_template: session.template?.name,
            });
        }








        // if (!resultAction.action) {
        //     return res.status(401).json({ error: 'Action template dont exists' });
        // }
        let matchAction = session?.template;

        if ((!session?.status || session?.status != 'confirmation')) {
            let action = await findActionTemplateByName((resultAction.template || session.template_name));

            if (action) {
                matchAction = action
            }
        }



        if ((!matchAction?.name && !session?.template_name)) {
            // Format results for user
            const formattedResponse = await aiService.formatResultsForUser(
                ['Action not allowed'],
                `Unable to process your request. Action not Allowed!`
            );
            response.message = formattedResponse;

            return res.json({
                ...response,
                results: [],
                session: session.id,
            });
        }


        let fieldValidations = {};

        matchAction?.parameters.map(a => {
            fieldValidations[a.name] = {
                required: a.required,
                type: a.data_type,
                default: a.default
            };
        })


        // createExtractionPrompt

        console.log(matchAction, 'MATCH ACTION')
        session.template = matchAction;
        session.template_name = matchAction.name;
        session.resourceName = matchAction.target_resource_type.name







        let resp = await agenticService.generateAIResponse(session, message)
        let agentResp = JSON.parse(resp.response);

        if (matchAction) {
            matchAction.conditions = agentResp.whereConditions;
        }
        session.query = agentResp;









        // matchAction.conditions = agentResp.whereConditionss;







        sessionManager.addHistory(session.id, {
            role: 'user',
            content: message
        });

        // Add AI response to history
        sessionManager.addHistory(session.id, {
            role: 'assistant',
            content: JSON.stringify(agentResp)
        });



        sessionManager.updateSession(session.id, session)



        let { isValid } = actionTemplateService.validateOperation(matchAction.action_type, agentResp)



        if ((matchAction.action_type != 'read' || Object.keys(matchAction.conditions))) {
            resourceData = await actionTemplateService.handleRead(matchAction, agentResp.data);
            if (resultAction?.resource) {
                session.context[resultAction?.resource] = resourceData;
                session.status = agentResp.status;
                session.results = resourceData;
            }
        }





        if (!isValid) {

            const formattedResponse = await aiService.formatResultsForUser(
                session.context,
                message,
                'Provide action details summary. And ask followup questions!'
            );



            sessionManager.updateSession(session.id, session)

            if (voice) {
                await voicespeak(formattedResponse);
            }
            return res.json({
                results: session.results,
                message: formattedResponse,
                session: session,
                sessionId: session.id,
                query: agentResp,
                action_template: matchAction.name,
            });


        } else if (isValid && (matchAction.action_type == 'update' || matchAction.action_type == 'delete' || matchAction.action_type == 'create')) {





            const formattedResponse = await aiService.formatResultsForUser(
                session.context,
                message,
                'Respond with summary of data and ask for Confirmation to proceed with the action.'
            );


            sessionManager.updateSession(session.id, session)

            if (voice) {
                await voicespeak(formattedResponse);
            }

            return res.json({
                results: resourceData,
                message: formattedResponse,
                session: session,
                sessionId: session.id,
                query: agentResp,
                action_template: matchAction.name
            });

        }








        const formattedResponse = await aiService.formatResultsForUser(
            resourceData?.length ? resourceData : ['No Data Found'],
            message,
            `IF context has data array or object Describe the data in the response or else ${agentResp.actionSummary}`
        );


        response.message = formattedResponse;




        sessionManager.updateSession(session.id, session)




        if (voice) {
            await voicespeak(response.message);
        }


        return res.json({
            results: resourceData,
            message: response.message,
            session: session,
            sessionId: session.id,
            query: agentResp,
            action_template: matchAction.name
        });
    } catch (error) {
        console.log(error, 'ERRRR',
            error.details,
            error.message,
            error.name)

        const formattedResponse = await aiService.formatResultsForUser(
            error.details,
            message,
            error.name
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
    let { voice } = req.query;
    console.log(voice, 'VOICIE')

    voice = voice == 'true' ? true : false
    console.log(voice == true, 'VOICIE')
    const { message, conversation_id } = req.body;

    let session = sessionManager.getSession(conversation_id);
    // let session = sessionManager.getSession('session_420230');




    try {

        if (!session) {
            console.log('[Session] Creating new session');
            session = sessionManager.createSession(conversation_id);
        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }


        if (session.status == 'confirmation') {

            const { confirmed } = await generateAIResponse(session, message, { model: "alayon_confirmation" })


            if (confirmed) {
                // response = await handleAIResponse(session, session.query);
                const confirmResult = await confirmOperation(session, 'yes');
                console.log(confirmResult, 'CONFIRM RES', session)
                const formattedResponse = await aiService.formatResultsForUser(
                    session.results,
                    session.lastMessage,
                    'Provide short and precise description of the effect of the action from data context.'
                );
                session.status = '';
                sessionManager.updateSession(session.id, session)

                if (voice) {
                    await voicespeak(formattedResponse);
                }

                return res.json({
                    message: formattedResponse,
                    session,
                    sessionId: session.id,
                    query: session.query

                });
            } else {
                session.status = 'followup';
            }
        }






        let actionTemplates = await getActionTemplates();

        const actionPrompt = aiService.buildOllamaPrompt(actionTemplates.map(a => { return { name: a.name, description: a.description, action: a.action_type, resource: a.target_resource_type.name } }), message)
        console.log(actionPrompt, 'ACTION')
        const ollamaResponse = await generateAIResponse(session, actionPrompt, { model: "alayon_action" })
        console.log(ollamaResponse, 'OLLAMA RESPONSE')


        if (ollamaResponse?.action == 'clear') {
            session = sessionManager.createSession(conversation_id);

            const formattedResponse = await aiService.formatResultsForUser(
                [],
                message,
                'Respond short message informing - "Data successfully cleared, you can now ask your next question."'
            );
            if (voice) {
                await voicespeak(formattedResponse);
            }
            return res.json({
                message: formattedResponse,
                session,
                sessionId: session.id,
                query: session.query

            });
        }


        if (ollamaResponse?.resource) {
            let resource = await findResourceByName(ollamaResponse?.resource);
            session.resourceName = ollamaResponse?.resource
            session.resourceId = resource.id
            console.log(resource, 'RESOURCE ID')
            sessionManager.updateSession(session.id, session)

        }












        // const conversation = getConversation(conversation_id);
        const response = await processMessage(message, session);
        console.log(response, 'RESP')
        if (response.needsConfirmation) {
            session.status = 'confirmation';
            session.lastMessage = message;
        } else {
            session.status = 'followup'

        }

        // updateConversation(conversationId, conversation);

        const formattedResponse = await aiService.formatResultsForUser(
            session.results,
            message,
            response.message
        );
        sessionManager.updateSession(session.id, session)

        if (voice) {
            await voicespeak(formattedResponse);
        }

        return res.status(200).json({
            message: formattedResponse,
            response: response,
            session: session,
            sessionId: session.id,
            action: ollamaResponse
        });
    } catch (error) {
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

async function handleAIResponse(conversation, query) {
    const lastMessage = conversation.history[conversation.history.length - 1].content;

    try {































































        // Try to convert natural language to action template
        // const { template_name, parameters = {}, explanation } =
        //     await aiService.generateQueryFromNaturalLanguage(
        //         lastMessage,
        //         conversation.resource_type_id
        //     );

        /*        const { filterQuery } = await aiService.generateQueryFromNaturalLanguageConvo(
                   lastMessage,
                   conversation
               );
       
               console.log(template_name, parameters, explanation, 'aaass')
       
        */
        let template = conversation.template;
        // Execute the action template
        // const template = await db.ActionTemplate.findOne({
        //     where: { name: template_name },
        //     include: [{ model: db.ActionTemplateParameter, as: 'parameters' }, { model: db.ResourceTag, as: 'target_resource_type' }]
        // });

        if (!template) {
            throw new Error(`Action template "${template.name}" not found`);
        }

        // template.filterQuery = filter;
        let parameters = query?.data;
        let filter = query?.whereConditions;
        // Validate parameters against template requirements
        const validationErrors = [];

        // 1. Check for missing required parameters
        const missingRequiredParams = template.parameters
            .filter(p => p.is_required && !parameters.hasOwnProperty(p.name) && !p.default_value)
            .map(p => p.name);

        if (missingRequiredParams.length > 0) {
            validationErrors.push({
                type: 'MISSING_REQUIRED',
                message: 'Missing required parameters',
                details: missingRequiredParams
            });
        }

        // 2. Check for parameters not defined in the template
        const allowedParamNames = template.parameters.map(p => p.name);
        const extraParams = Object.keys(parameters).filter(
            paramName => !allowedParamNames.includes(paramName)
        );

        /*       if (extraParams.length > 0) {
                  validationErrors.push({
                      type: 'EXTRA_PARAMETERS',
                      message: 'Parameters not allowed by template',
                      details: extraParams
                  });
              } */

        // 3. Validate parameter values against allowed fields (if template has field restrictions)
        // if (template.allowed_fields && template.allowed_fields.length > 0) {
        //     const allowedFieldValues = template.allowed_fields.reduce((acc, field) => {
        //         acc[field.field_name] = field.allowed_values
        //             ? JSON.parse(field.allowed_values)
        //             : null;
        //         return acc;
        //     }, {});

        //     const invalidFieldValues = [];

        //     for (const [paramName, paramValue] of Object.entries(parameters)) {
        //         if (allowedFieldValues[paramName] &&
        //             !allowedFieldValues[paramName].includes(paramValue)) {
        //             invalidFieldValues.push({
        //                 parameter: paramName,
        //                 value: paramValue,
        //                 allowed: allowedFieldValues[paramName]
        //             });
        //         }
        //     }

        //     if (invalidFieldValues.length > 0) {
        //         validationErrors.push({
        //             type: 'INVALID_VALUES',
        //             message: 'Parameter values not in allowed values',
        //             details: invalidFieldValues
        //         });
        //     }
        // }

        // 4. Apply default values for missing optional parameters
        if (template.parameters && template.parameters.length) {
            for (const param of template.parameters) {
                if (!parameters.hasOwnProperty(param.name) && param.default_value) {
                    parameters[param.name] = param.default_value;
                }
            }
        }



        // Return validation errors if any
        if (validationErrors.length > 0) {
            /*       return res.status(400).json({
                      error: 'Parameter validation failed',
                      validationErrors
                  }); */
            // return {
            //     type: 'conversation',
            //     text: 'Parameter validation failed',
            //     error: validationErrors
            // };
            throw new Error(`Parameter validation failed`);

        }



        const results = await actionTemplateService.executeTemplate(template.name, parameters, filter);


        // Format results for user
        const formattedResponse = await aiService.formatResultsForUser(
            results,
            lastMessage
        );




        return {
            type: 'report',
            text: formattedResponse,
            template_used: template.name,
            parameters,
            results,
            filter
        };
    } catch (error) {
        console.error('Error in handleAIResponse:', error);

        // Fallback to general conversation if template execution fails
        const fallbackResponse = await aiService.generateResponse(`
You are a helpful assistant for a Data Resources Platform. The user asked:
"${lastMessage}"

We encountered an error trying to generate a report:
${error?.message ? error.message : error}

Please respond precisely and helpfully, explaining the issue in non-technical way.
 Response should be short, SMS Friendly format not more than 700 characters long.
        `);

        return {
            type: 'conversation',
            text: fallbackResponse,
            error: error?.message ? error.message : error
        };
    }
}



export default router;