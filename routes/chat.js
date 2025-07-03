import express from 'express';
import { db } from '../models/index.js';
import aiService from '../services/aiServices.js';
import { executeTemplate, getActionTemplates, handleCreate, handleRead } from '../services/ActionTemplateService.js';
import { voicespeak } from '../speak.js';
import { sessionManager } from '../services/sessionStore.js';
import { findActionTemplateByName, findResourceByName, getResourceTypes } from '../services/ResourceService.js';
import { extractResourceName, objectToAIString } from '../helpers/helpers.js';
import { findBestMatch, findMatchAction } from '../services/ollamaService.js';
import AgenticAIService from '../services/agenticService.js';

const router = express.Router();

// Store conversation state in memory (for production use Redis)


const agenticService = new AgenticAIService(db);

router.post('/alayon', async (req, res) => {
    const { voice } = req.query;
    const { message, conversation_id } = req.body;
    let session = sessionManager.getSession(conversation_id);
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



        sessionManager.addHistory(session.id, {
            role: 'user',
            content: message
        });


        let actionTemplates = await getActionTemplates();


        const matchAction = await findMatchAction(actionTemplates, message);


        if (!matchAction) {
            // Format results for user
            const formattedResponse = await aiService.formatResultsForUser(
                [],
                message,
                'Action Not Allowed!'
            );
            response.message = formattedResponse;

            return res.json({
                ...response,
                results: [],
                session: session.id,

            });
        }

        session.template = matchAction;


        let resp = await agenticService.generateAIResponse(session, message)
        let agentResp = JSON.parse(resp.response);
        session.query = agentResp;


        if ((matchAction && ['read', 'update', 'delete'].includes(matchAction.action_type))) {

            resourceData = await handleRead(matchAction, agentResp.params, agentResp.filter);

            session.results = resourceData;






















        } else if (matchAction.action_type == 'create') {
            resourceData = await handleCreate(matchAction, agentResp.params)
        }









        // Add AI response to history
        session.history.push({ role: 'assistant', content: resp });

        sessionManager.updateSession(session.id, session)





        return res.json({
            message: response.message,
            session: session.id,
            results: resourceData,
            query: agentResp,
            action_template: matchAction.name
        });
    } catch (error) {
        console.log(error, 'ERRRR')
        res.status(500).json({ error: error.message });
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
    const { voice } = req.query;
    const { message, resource_type_id, conversation_id } = req.body;
    let session = sessionManager.getSession(conversation_id);
    let response = {
        text: 'Hi There!'
    }
    try {




        if (!session) {
            console.log('[Session] Creating new session');
            session = sessionManager.createSession(conversation_id);
            // await agenticService.createConversation(session.id)
        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }






        sessionManager.addHistory(session.id, {
            role: 'user',
            content: message
        });


        let actionTemplates = await getActionTemplates();


        const match = await findMatchAction(actionTemplates.map(a => a.name), message);


        console.log(match, 'MATCH')
        if (match) {
            session.resource_type_id = match.target_resource_type_id
            session.template = match;

        }


        let resp = await agenticService.chat(session.id, message)



        let agentResp = JSON.parse(resp.response);

        // Handle initialization stage
        // if (!session.organization || !session.resourceName) {
        //     const result = await handleResourceSelection(message, session);

        //     if (result.organization) {
        //         session.organization = result.organization;
        //     }
        //     if (result.resourceName) {
        //         session.resourceName = result.resourceName;
        //         session.resource_type_id = result.resourceId;
        //         session.template = result.template;
        //     }

        //     if (result.resourceFields) {
        //         session.resourceFields = result.resourceFields
        //     }


        //     sessionManager.updateSession(session.id, session);
        //     /*            sessionManager.addHistory(session.id, {
        //                    role: 'assistant',
        //                    content: result.followUp
        //                });
        //     */
        //     // console.log(session, 'sssesss')
        //     response.text = result.followUp;
        //     /*            return res.json({
        //                    conversation_id: session.id,
        //                    response: {
        //                        type: 'resource',
        //                        text: result.followUp,
        //                    },
        //                    history: session.history
        //                }); */
        // }






        /*        // Create or retrieve conversation
               let conversation = conversation_id && conversations.get(conversation_id);
               if (!conversation) {
                   conversation = {
                       history: [],
                       resource_type_id
                   };
                   const newId = Date.now().toString();
                   conversations.set(newId, conversation);
                   conversation.id = newId;
               } */

        // Add user message to history
        // conversation.history.push({ role: 'user', content: message });

        // Generate AI response
        if (session.resource_type_id && session.template) {
            response = await handleAIResponse(session, agentResp);
        }

        if (response && response.text && voice) {
            await voicespeak(response.text);
        }


        // Add AI response to history
        session.history.push({ role: 'assistant', content: response });

        sessionManager.updateSession(session.id, session)

        res.json({
            conversation_id: session.id,
            response,
            history: session.history
        });
    } catch (error) {
        console.log(error, 'ERRRR')
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
        console.log(query, 'QUERY')

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

        let parameters = query?.params;
        let filter = query?.filter;
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

        if (extraParams.length > 0) {
            validationErrors.push({
                type: 'EXTRA_PARAMETERS',
                message: 'Parameters not allowed by template',
                details: extraParams
            });
        }

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


        console.log('EXECUTE', template)
        const results = await executeTemplate(template, parameters, filter);

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

async function handleResourceSelection(prompt, session) {
    const updates = {};
    let followUp;
    // const orgs = await getOrganizations();
    const resrcs = await getResourceTypes();

    // if (!session.organization) {
    //     const { value, feedback, suggestions } = await extractOrganization(prompt);
    //     console.log(orgs, 'orgss', value, feedback, suggestions)
    //     if (value) {
    //         updates.organization = value;
    //         followUp = `${feedback}\nWhich resource in ${value}?`;
    //     } else {
    //         followUp = `${feedback}\nAvailable organizations: ${orgs.join(', ')}` +
    //             (suggestions?.length ? `\nDid you mean: ${suggestions.join(', ')}` : '');
    //     }
    // }

    // else 
    const { value, feedback, confidence } = await extractResourceName(prompt, resrcs);
    let resource = await findResourceByName(value)

    if (value && resource) {

        updates.resourceFields = resource?.fields
        updates.resourceName = value;
        updates.resourceId = resource.id
        updates.resource = resource;



    } else {
        followUp = `${feedback}\n${resrcs.length ? `Available resources: ${resrcs.join(', ')}` : ''}`;
    }



    if (resource.action_templates) {
        let actions = resource.action_templates.map(a => a.name)


        const match = await findMatchAction(actions, prompt);
        console.log(match, 'matchs')
        updates.resourceId = resource.id

        if (match) {
            let action_template = await findActionTemplateByName(match);
            updates.template = action_template;
        } else {
            followUp = `Action not allowed for Resource ${value}?\nAvailable actions:\n ${JSON.stringify(actions)}`;
        }

























    } else {
        followUp = `No Actions allowed in this resources. Can I help you with another else?`;
    }




    // const updatedSession = await sessionStore.updateSession(session._id, {
    //     ...updates,
    //     userInput: prompt,
    //     followUp
    // });


    return {
        sessionId: session.id,
        // ...updatedSession.state,
        ...updates,
        followUp,
    };
}

export default router;