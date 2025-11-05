import express from 'express';
// import { validateRequest } from '../middleware/validation.js';
import { db } from '../models/index.js';
import { ActionEngine } from '../services/ActionEngine.js';
import { ActionService } from '../services/ActionTriggerService.js';
import { findActionTemplateByName, findActionTemplates, getOrganizationById, getOrganizationsByNumber } from '../services/ResourceService.js';
import { AIAgent } from '../services/aiAgent.js';
import { sessionManager } from '../services/sessionStore.js';
import { chatExecute } from '../controllers/actionController.js';
import { removeNullKeys, sanitizePhoneNumber } from '../helpers/helpers.js';
import contextManager from "../services/contextManager1.js";
import { AIService  } from '../services/aiService.js';
import { sendSpeak } from '../services/communicationService.js';



const actionEngine = new ActionEngine();


const router = express.Router();

// Create a new action template
router.post('/', async (req, res, next) => {
    try {
    
    
    
        const template = await db.ActionTemplate.create({
            ...req.body,
            ...(req.tenantId ? { tenant_id: req.tenantId } : {})
        });
        
        
        
        
        res.status(201).json(template);
    } catch (error) {
    console.log(error, 'ERROR')
        res.status(400).json({ error: error.message });
    }
});

// Execute an action template
router.post('/:templateId/execute', async (req, res) => {
    try {
        const { conversation_id, parameters: rawParams = {} } = req.body;

        // 1. Fetch template
        const template = await findActionTemplateByName(req.params.templateId);
        
        if (!template) {
            return res.status(400).json({ message: "Template doesn't exist." });
        }

        const parameters = { ...rawParams };
        const validationErrors = [];

        // 2. Build a parameter definition map for easier lookup
        const paramMap = {};
        for (const p of template.parameters) {
            paramMap[p.field_name] = p;
        }

        // 3. Check for missing required parameters
        const missingRequiredParams = template.parameters
            .filter(p => p.is_required && (parameters[p.field_name] === undefined || parameters[p.field_name] === null || parameters[p.field_name] === ''))
            .map(p => p.field_name);

        if (missingRequiredParams.length > 0) {
            validationErrors.push({
                type: 'MISSING_REQUIRED',
                message: 'Missing required parameters',
                details: missingRequiredParams
            });
        }

        // 4. Check for parameters not defined in the template
        const allowedParamNames = Object.keys(paramMap);
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

        // 5. Validate type, allowed values, and regex pattern
        const typeErrors = [];
        const allowedValueErrors = [];
        const regexErrors = [];

        for (const [name, value] of Object.entries(parameters)) {
            const def = paramMap[name];
            if (!def) continue; // skip if not in template

            // a) Type validation
            if (def.type) {
                let isValidType = true;
                switch (def.type) {
                    case 'string':
                        isValidType = typeof value === 'string';
                        break;
                    case 'number':
                        isValidType = typeof value === 'number' && !isNaN(value);
                        break;
                    case 'boolean':
                        isValidType = typeof value === 'boolean';
                        break;
                    case 'array':
                        isValidType = Array.isArray(value);
                        break;
                    default:
                        break; // unknown type, skip
                }
                if (!isValidType) {
                    typeErrors.push({ parameter: name, expected: def.type, received: typeof value });
                }
            }

            // b) Allowed values check
            if (def.allowed_values && Array.isArray(def.allowed_values)) {
                if (!def.allowed_values.includes(value)) {
                    allowedValueErrors.push({ parameter: name, value, allowed: def.allowed_values });
                }
            }

            // c) Regex pattern check
            if (def.regex_pattern) {
                const pattern = new RegExp(def.regex_pattern);
                if (!pattern.test(value)) {
                    regexErrors.push({ parameter: name, value, pattern: def.regex_pattern });
                }
            }
        }

        if (typeErrors.length > 0) {
            validationErrors.push({ type: 'INVALID_TYPE', message: 'Invalid parameter type(s)', details: typeErrors });
        }
        if (allowedValueErrors.length > 0) {
            validationErrors.push({ type: 'INVALID_VALUE', message: 'Value not in allowed list', details: allowedValueErrors });
        }
        if (regexErrors.length > 0) {
            validationErrors.push({ type: 'INVALID_FORMAT', message: 'Value does not match required pattern', details: regexErrors });
        }

        // 6. Apply default values for missing optional parameters
        for (const paramDef of template.parameters) {
            if (parameters[paramDef.field_name] === undefined && paramDef.default_value !== undefined) {
                parameters[paramDef.field_name] = paramDef.default_value;
            }
        }

        // 7. Return all validation errors if present
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Parameter validation failed',
                validationErrors
            });
        }

        // 8. Create trigger
        const trigger = await db.ActionTrigger.create({
            ...req.body,
            action_template_id: template.id,
            tool_type: template.tool_type,
            parameters
        });

        let result = null;
        if (trigger.trigger_type !== 'IMMEDIATE') {
            await ActionService.scheduleTrigger(trigger);
        } else {
            result = await actionEngine.execute(template, parameters);
        }




        res.status(200).json({
            status: 200,
            ...result
        });

    } catch (error) {
        console.error(error, "Execution error");
        res.status(400).json({
            error: error?.message || 'Execution failed',
            details: error?.details || null
        });
    }
});

router.post('/:templateId/chat', async (req, res) => {
    const { conversation_id, message } = req.body;

    let session = await sessionManager.getSession(conversation_id);
    // let session = sessionManager.getSession('session_420230');



    try {

        if (!session) {
            console.log('[Session] Creating new session');
            session = await sessionManager.createSession(conversation_id);

        } else {
            console.log(`[Session] Using existing session: ${session.id}`);
        }

        let template = await findActionTemplateByName(req.params.templateId);
        // let result;

        if (!template) return res.status(400).json({ message: "Template doesn't exist." })


        const agent = new AIAgent('template_engine', session.conversation_id);




        await agent.initialize(session, template.id);

        console.log('[MESSAGE] Processing user input...');



        const response = await agent.generateAction(message, template);


        console.log('[MESSAGE] Action processed', JSON.stringify(response));








        // Validate parameters against template requirements
        const validationErrors = [];
        const parameters = response.parameters;
        const config = response.template_output;
        // 1. Check for missing required parameters
        const missingRequiredParams = template.parameters
            .filter(p => p.is_required && !parameters.hasOwnProperty(p.field_name) && !p.default_value)
            .map(p => p.field_name);

        if (missingRequiredParams.length > 0) {
            validationErrors.push({
                type: 'MISSING_REQUIRED',
                message: 'Missing required parameters',
                details: missingRequiredParams
            });
        }

        // 2. Check for parameters not defined in the template
        const allowedParamNames = template.parameters.map(p => p.field_name);
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



        // 4. Apply default values for missing optional parameters
        if (template.parameters && template.parameters.length) {
            for (const param of template.parameters) {
                if (!parameters.hasOwnProperty(param.field_name) && param.default_value) {
                    parameters[param.field_name] = param.default_value;
                }
            }
        }

        // Return validation errors if any
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Parameter validation failed',
                validationErrors
            });
        }




        let result = null;



        const trigger = await db.ActionTrigger.create({
            ...req.body,
            action_template_id: template.id,
            tool_type: template.tool_type,
            parameters: parameters
        });



        if (trigger.trigger_type !== 'IMMEDIATE') {
            await ActionService.scheduleTrigger(trigger);
        } else {
            // this.executeImmediately(trigger);
            result = await actionEngine.execute(
                { ...template, config },
                parameters
            );
        }






        res.status(200).json({
            status: 200,
            data: result
        });
    } catch (error) {
        console.log(error, 'ERRR')
        // console.log(error, "ERRORrr")
        res.status(400).json({
            error: error?.message,
            details: error?.details
        });
    }
});

router.post('/chat', async (req, res) => {

  try {
    const { conversation_id, message} = req.body;
    // Ensure session exists
    // let session = await sessionManager.getSession(conversation_id);
    let session = await contextManager.getSession(conversation_id);


    // console.log(session, 'SESSION CONTEXT', req.tenantId)

    // Get org context
    const org = await getOrganizationById(req.tenantId);

    // Step 1: Select action template
    const selectorTemplate = await findActionTemplates('chat', org?.id);
    
    
    
    
                 
                 
                 const actionAi = await new AIService(session.id, `action_selector_${org.id}`).init();

                    

                    let actionResponse = await actionAi.generateAction(message, {action_templates: selectorTemplate, last_action: session.context.last_action  });

      
      

    // Step 2: Execute selected template
    const execTemplate = await findActionTemplateByName(actionResponse.selected_template, org?.id);
    console.log('Step 2: Execute selected template', execTemplate)


    
    
    
    const execResult = await chatExecute({
      message: `${actionResponse.refined_prompt} (Refined from: ${message})`,
      sessionId: session.id,
      template: execTemplate,
      action: actionResponse,
      tenant_id: org?.id
    });
    
    
    let response;
    
    
    
    
        if(!execResult.message){

             const ai = await new AIService(session.id, `alayon_model_${org.id}`).init();
                response = await ai.query(message, {context: execResult  });
                
        } else {
            response = execResult;
        }




    // Step 3: Generate AI response
    // const agent = new AIAgent(`alayon_model_${org?.id}`, session.conversation_id);
    // await agent.initialize(session, org?.id);
    // const alayonResult = await agent.generateAlayon(message, execResult);


    if(req.body.speak){
        sendSpeak(response)
    }

 
     let context = await contextManager.addContext(session.id, {last_action: actionResponse});

 
 
    return res.status(200).json({
      message: response.message,  
      data: { ...response },
      context: context,
      sessionId: session.id,
      success: true
    //   result: a
    });
  } catch (error) {
    console.error(error, 'CHAT ERROR');
    res.status(400).json({ success: false, details: error?.details });
  }
});

router.post('/sms', async (req, res) => {
  try {
    const { sender, message, system } = req.body;
    const convId = sanitizePhoneNumber(sender);

    // Ensure session exists
    let session = await contextManager.getSession(convId);


    if (sanitizePhoneNumber(sender) === sanitizePhoneNumber(system)) {
      return res.status(200).json({ message: 'Sender and receiver cannot be the same.' });
    }

    // Get org + user context
    const org = await getOrganizationsByNumber(sanitizePhoneNumber(system));
    const user = await contextManager.handleMobileSubscription(sender, org?.id);

    const subscriptionTemplate = await findActionTemplateByName('check_subscription', org?.id);

    session.tenant_id = org?.id;
    if (user.attributes.isSubscribe == false) session.status = 'Not yet subscribe';






    session.user = user.attributes


    // Step 1: Run subscription check
    const subResult = await actionEngine.execute(subscriptionTemplate, {
      message: `##USER CONTEXT: ${JSON.stringify(session.user, null, 2)}\n\n` +
               `##LAST SCENARIO: ${session.status}\n\n` +
               `##USER PROMPT: ${message}`
    });


    session.user = {...session.user,  ...removeNullKeys(subResult.data.user)}

    await contextManager.handleUpdateMobile(user.id, session.user, session.user.isSubscribe);




    // Step 2: Handle unsubscribed users
    if (user.attributes.isSubscribe == false) {
      const smsAction = await findActionTemplateByName('send_sms', org?.id);

      if (subResult.data.scenario === 'confirm_subscription') {
        await contextManager.handleUpdateMobile(user.id, session.user, true);
        await actionEngine.execute(smsAction, {
          message: subResult?.data.message,
          recipients: [sender],
          message_types: ['FLASH']
        });
                    session.status = 'followup';
      } else {
            session.status = subResult.data.scenario;
      }

      await actionEngine.execute(smsAction, {
        message: subResult?.data.message,
        recipients: [sender]
      });


    //   session.status = subResult.data.scenario;
    session = await contextManager.addSessionState(session.id, session);
      return res.status(200).json(subResult?.data);
    }

    // Step 3: Handle subscribed users → Action Selection
    const selectorTemplate = await findActionTemplateByName('action_selector', org?.id);
    const actionResponse = await actionEngine.execute(selectorTemplate, { message:  `##CONTEXT: ${JSON.stringify(session, null, 2)}\n\n` +
               `##LAST SCENARIO: ${session.status}\n\n` +
               `##USER PROMPT: ${message}` });
  /*      const selectorTemplate = await findActionTemplateByName('Find Action Templates', org?.id);
    
    
    const selection = await actionEngine.execute(selectorTemplate, { tenantId: org.id});
    
                 
                 
                 
                 const actionAi = await new AIService(session.id, `action_selector_${org.id}`).init();

                    

                    let actionResponse = await actionAi.generateAction(message, {action_templates: selection.data, last_action: session.context.last_action  });

     */
    
    
    let execResult;
    
    
    if (actionResponse.data.selected_template !== 'check_subscription') {
      const execTemplate = await findActionTemplateByName(actionResponse.data.selected_template, org?.id);
      
      execResult = await chatExecute({
        message: 
         `##USER CONTEXT: ${JSON.stringify(session, null, 2)}\n\n` +
               `##LAST SCENARIO: ${session.status}\n\n` +
               `##USER PROMPT: ${actionResponse.data.refined_prompt} (Refined from: ${message})`,
        sessionId: session.id,
        template: execTemplate,
        action: actionResponse.data,
        tenant_id: org?.id
      });
            session.status = actionResponse.data.selected_template;
    } else {
    
      execResult = await actionEngine.execute(subscriptionTemplate, {
        message: `##USER CONTEXT: ${JSON.stringify(session.user, null, 2)}\n\n` +
                 `##LAST SCENARIO: ${session.status}\n\n` +
                 `##USER PROMPT: ${message}`
      });
      session.status = execResult.data.scenario;
      
      

      if (session.status === 'confirm_unsubscribe') {
      console.log('UNSUBSCRIBING!!')
        await contextManager.handleUpdateMobile(user.id, session.user, false);
      }
    }

      await contextManager.addSessionState(session.id, session);


    // Step 4: AI response if needed
    let alayonResult;
  if (actionResponse.data.selected_template === 'check_subscription') {
      alayonResult = execResult.data;

    } else {
    
        if(!execResult.message){

             const ai = await new AIService(session.id, `alayon_model_${org.id}`).init();
                alayonResult = await ai.query(message, {context: execResult  });
        } else {
            alayonResult = execResult;
        }
    }





    // Step 5: Post-hooks
    const smsAction = await findActionTemplateByName('send_sms', org?.id);
    const recipients =  alayonResult?.recipients || execResult?.recipients  || [];
    const hooks = actionResponse.data.post_hook_type || [];
























    await contextManager.addSessionState(session.id, session);

    if (actionResponse.data.trigger_type !== 'IMMEDIATE') {
      const trigger = await db.ActionTrigger.create({
        trigger_config: actionResponse.data.trigger_config,
        trigger_type: actionResponse.data.trigger_type,
        action_template_id: smsAction.id,
        tool_type: smsAction.tool_type,
        parameters: {
          message: alayonResult.message || execResult.message,
          recipients: [sender, ...removeNullKeys(recipients)],
          message_types: ['FLASH', ...hooks]
        }
      });
      await ActionService.scheduleTrigger(trigger);
      return res.status(200).json({
        result: execResult,
        message: `${smsAction.trigger_type} Action Scheduled!`
      });
    } else {
      await actionEngine.execute(smsAction, {
        message: alayonResult.message || execResult.message,
        recipients: [...removeNullKeys(recipients), sender],
        message_types: ['FLASH', ...hooks]
      });
      
      
      
      return res.status(200).json(alayonResult);
    }
  } catch (error) {
    console.error(error, 'SMS ERROR');
    res.status(400).json({ error: error?.message, details: error?.details });
  }
});

// Get all action templates
router.get('/', async (req, res) => {
    try {
        const templates = await db.ActionTemplate.findAll({
            where: {
                ...(req.tenantId ? { tenant_id: req.tenantId } : {})
            },
            order: [['updated_at', 'DESC']]
        });
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get template by name
router.get('/:name', async (req, res) => {
    try {
        const template = await db.ActionTemplate.findOne({
            where: {
                name: req.params.name,
                ...(req.tenantId ? { tenant_id: req.tenantId } : {})

            },
            include: [
                {
                    model: db.ActionTemplateParameter,
                    as: 'parameters'
                }
            ]
        });

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json(template);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update template
router.put('/:id', async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const { parameters, ...templateData } = req.body;

        // Validate template exists
        const existingTemplate = await db.ActionTemplate.findByPk(id, {
            /*   include: [{
                  model: db.ActionTemplateParameter,
                  as: 'parameters'
              }], */
            transaction
        });

        if (!existingTemplate) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Action template not found' });
        }

        // Update template fields
        const [updated] = await db.ActionTemplate.update({
            ...(req.tenantId ? { tenant_id: req.tenantId } : {}),
            parameters, ...templateData
        }, {
            where: { id },
            transaction
        });

        // Handle parameter updates if provided
        /*   if (parameters && Array.isArray(parameters)) {
              const existingParams = existingTemplate.parameters || [];
              const newParams = parameters || [];
         
              // Identify parameters to keep, update, and create
              const paramsToKeep = existingParams.filter(ep =>
                  newParams.some(np => np.id === ep.id)
              );
              const paramsToDelete = existingParams.filter(ep =>
                  !newParams.some(np => np.id === ep.id)
              );
              const paramsToCreate = newParams.filter(np => !np.id);
              const paramsToUpdate = newParams.filter(np =>
                  np.id && existingParams.some(ep => ep.id === np.id)
              );
         
              // Perform batch operations
              await Promise.all([
                  // Delete removed parameters
                  paramsToDelete.length > 0 && db.ActionTemplateParameter.destroy({
                      where: {
                          id: paramsToDelete.map(p => p.id),
                          template_id: id
                      },
                      transaction
                  }),
         
                  // Update modified parameters
                  ...paramsToUpdate.map(param =>
                      db.ActionTemplateParameter.update(param, {
                          where: { id: param.id },
                          transaction
                      })
                  ),
         
                  // Create new parameters
                  paramsToCreate.length > 0 && db.ActionTemplateParameter.bulkCreate(
                      paramsToCreate.map(param => ({
                          ...param,
                          template_id: id
                      })),
                      { transaction }
                  )
              ]);
          }
        */
        // Fetch the fully updated template
        const updatedTemplate = await db.ActionTemplate.findByPk(id, {
            include: [

                // {
                //     model: db.ActionTemplateParameter,
                //     as: 'parameters',
                //     attributes: ['id', 'name', 'data_type', 'required', 'default_value']
                // }
            ],
            transaction
        });

        await transaction.commit();
        return res.json(updatedTemplate);
    } catch (error) {
        if (transaction.finished !== 'commit') {
            await transaction.rollback();
        }

        console.error('Error updating action template:', error);

        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.errors.map(e => ({
                    field: e.path,
                    message: e.message
                }))
            });
        }

        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(400).json({
                error: 'Invalid reference',
                details: 'The specified target resource type does not exist'
            });
        }

        next(error);
    }
});

// Delete template
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await db.ActionTemplate.destroy({
            where: { id: req.params.id }
        });

        if (!deleted) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



export default router;