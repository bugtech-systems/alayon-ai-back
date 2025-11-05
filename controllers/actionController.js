import { ActionService } from '../services/ActionTriggerService.js';
import { db } from '../models/index.js';
import { ActionEngine } from '../services/ActionEngine.js';
import { AIService  } from '../services/aiService.js';
import contextManager from '../services/contextManager1.js';


const actionEngine = new ActionEngine();


export const createTemplate = async (req, res) => {
    try {
        const template = await db.ActionTemplate.create(req.body);
        res.status(201).json(template);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getTemplates = async (req, res) => {
    try {
        const templates = await db.ActionTemplate.findAll();
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createTrigger = async (req, res, next) => {
    try {

        const trigger = await ActionService.createTrigger(
            req.params.templateId,
            req.body
        );
        res.status(201).json(trigger);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const executeNow = async (req, res) => {
    try {




        const result = await ActionService.executeAction(
            req.params.templateId,
            req.body.parameters,
            req.body.initiator
        );
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getAuditLogs = async (req, res) => {
    try {
        const { page = 1, limit = 50, ...query } = req.query;
        const logs = await db.AuditLog.findAll({
            where: query,
            include: [db.ActionTemplate],
            order: [['executed_at', 'DESC']],
            limit: parseInt(limit),
            offset: (page - 1) * limit
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const cancelTrigger = async (req, res) => {
    try {
        const trigger = await db.ActionTrigger.findByPk(req.params.triggerId);
        if (!trigger) {
            return res.status(404).json({ error: 'Trigger not found' });
        }

        await ActionService.cancelTrigger(trigger.id);
        await trigger.update({ is_active: false });

        res.json({ message: 'Trigger cancelled successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const cancelAllTrigger = async (req, res) => {
    try {
        const triggers = await db.ActionTrigger.findAll({ where: { is_active: true } });
        if (!triggers.length) {
            return res.status(404).json({ error: 'Trigger not found' });
        }

        for (let trigger of triggers) {
            await ActionService.cancelTrigger(trigger.id);
            await trigger.update({ is_active: false });
        }




        res.json({ message: 'Trigger cancelled successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const chatExecute = async (options) => {
    const { sessionId, message, template, tenant_id } = options;


    let session = await contextManager.getSession(sessionId);


    try {


        // let result;

        if (!template) return { error: true, message: "Template doesn't exist." };
        
        contextManager.addContext(session.id, { tenant_id })


 
  
        const ai = await new AIService(session.id, `template_engine_${tenant_id}`).init();

        const response = await ai.generateTemplate(message, template);







        // const agent = new AIAgent(`template_engine_${tenant_id}`, session.conversation_id);




        // await agent.initialize(session, tenant_id);

        // console.log('[MESSAGE] Processing user input...', template);



        // const response = await agent.generateAction(message, template);


        // console.log('[MESSAGE] Action processed', JSON.stringify(response));


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
            return { error: true, message: 'Parameter validation failed', validationErrors };
        }


        if (extraParams.length > 0) {
            validationErrors.push({
                type: 'EXTRA_PARAMETERS',
                message: 'Parameters not allowed by template',
                details: extraParams
            });
        }


        let result = null;



        const trigger = await db.ActionTrigger.create({
            ...options,
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


        // return res.status(200).json({
        //     status: 200,
        //     ...result.data,
        //     ...(validationErrors.length ? { validation_notes: validationErrors } : {})
        // });
        return result.data
    } catch (error) {
        console.log(error, 'ERRR')
        // console.log(error, "ERRORrr")
        return {
            error: error?.message,
            details: error?.details
        }
        /*  return res.status(400).json({
             error: error?.message,
             details: error?.details
         }); */
    }
};

