import { db } from '../models/index.js';
import { sendEmail, sendSMS, sendSpeak } from './communicationService.js';
import * as expressionEvaluator from './expressionEvaluator.js';
import axios from 'axios';
import { findActionTemplateByName } from './ResourceService.js';
import { AIAgent } from '../services/aiAgent.js';
import { AIService  } from '../services/aiService.js';
import contextManager from './contextManager1.js';

// Unique ID generator for executions
const generateExecutionId = () =>
    `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Executes action templates with field mapping resolution
 */
export class ActionEngine {
    constructor() {
        this.context = {};
        this.executionId = null;
    }

    /**
     * Execute an action template
     * @param {number} templateId - ID of action template
     * @param {object} parameters - Initial parameters
     * @param {number|null} triggerId - Associated trigger ID
     * @returns {Promise<object>} Execution result
     */
  async execute(temp, parameters = {}, triggerId = null) {
    const template = await db.ActionTemplate.findByPk(temp?.id);
    if (!template) throw new Error('Action template not found');

    this.executionId = generateExecutionId();
    const baseContext = {
      params: parameters,
      outputs: {},
      executionId: this.executionId,
      ...(parameters.conversation_id ? { conversation_id: parameters.conversation_id } : {}),
      tenant_id: template.tenant_id
    };

    const auditLog = await db.AuditLog.create({
      action_template_id: template.id,
      action_trigger_id: triggerId,
      action_type: template.tool_type,
      status: 'RUNNING',
      executed_at: new Date(),
      request_data: { parameters, template: template.get({ plain: true }) },
      execution_id: this.executionId,
      context: baseContext
    });

    try {
      if (template.pre_hooks) {
        await this.processHooks(template.pre_hooks, baseContext);
      }

      let result = await this.executeAction(template, baseContext);
      baseContext.outputs = {...baseContext.outputs, [template?.output_as ? template.output_as : "main"]: result};



console.log(result, 'ACTION RESULT')
      if (template.post_hooks) {
        await this.processHooks(template.post_hooks, baseContext);
      }

      await auditLog.update({
        status: 'COMPLETED',
        completed_at: new Date(),
        response_data: result,
        context: baseContext
      });
      
          // Apply output mapping if defined
    if (template.output_template && Object.keys(template.output_template).length != 0) {
      result = await expressionEvaluator.evaluatePlaceholders(template.output_template, {
        context: baseContext,
        outputs: baseContext.outputs,
        result
      });
    }
      
      return {data: result, context: baseContext.outputs};
    } catch (error) {
      console.error('[ActionEngine] Error executing action', error);
      await auditLog.update({
        status: 'FAILED',
        completed_at: new Date(),
        error_details: error.message
      });
      throw error?.response?.data || error;
    }
  }

    /**
     * Process pre/post hooks
     * @param {object[]} hooks - Array of hook definitions
     * @param {object} context - Execution context
     */
     async processHooks(hooks, context) {
  for (const hook of hooks) {
    if (!hook.template) continue;

    const hookTemplate = await findActionTemplateByName(hook.template);
    if (!hookTemplate) continue;

    // Check hook conditions
    if (hook.conditions && !this.evaluateConditions(hook.conditions, context.params)) {
      console.log(`[ActionEngine] Skipping hook ${hook.template} (conditions not met)`);
      continue;
    }

    try {
      const hookParams = await expressionEvaluator.evaluatePlaceholders(
        hook.parameters || {},
        context
      );

      const hookResult = await this.executeAction(hookTemplate, {
        ...context,
        params: { ...context.params, ...hookParams }
      });

      // Apply output mapping
      let output = hook.output_as || hookTemplate?.output_as || hook.template;
      if (hook.output_template && Object.keys(hook.output_template).length !=  0) {
        const mappedOutput = await expressionEvaluator.evaluatePlaceholders(
          hook.output_template,
          { ...context, outputs: { ...context.outputs, [output]: hookResult }, result: hookResult }
        );
        context.outputs[output] = mappedOutput;
      } else {
        context.outputs[output] = hookResult;
      }
    } catch (err) {
      console.error(`[ActionEngine] Hook ${hook.template} failed`, err);
      if (hook.fatal) {
        throw new Error(`Fatal hook failure: ${hook.template}`);
      }
      // otherwise, just log and continue
    }
  }
}
     
     
 /*    async processHooks(hooks, context) {
        for (const hook of hooks) {
            let name = hook.template

            if (!name) {
                return null
            }

            let hookTemplate = await findActionTemplateByName(name);

            // const hookTemplate = await db.ActionTemplate.findOne({ where: options });
            if (!hookTemplate) continue;

            // Resolve hook parameters
            const hookParams = await expressionEvaluator.evaluatePlaceholders(
                hook.parameters,
                context
            );

            console.log(hookTemplate.id, hook.parameters, hookParams, context)

            // Execute hook
            const hookResult = await this.executeAction(hookTemplate, {
                ...context,
                params: { ...context.params, ...hookParams }
            });



            // console.log(hook, 'hoook', template)
            let output = hook.output_as ? hook.output_as : hookTemplate?.output_as ? hookTemplate?.output_as : name
            // Store hook output
            context.outputs[output] = hookResult;
        }
    } */

    /**
     * Execute a single action
     * @param {ActionTemplate} template - Action template
     * @param {object} context - Execution context
     * @returns {Promise<object>} Action result
     */
    // async executeAction(temp, context) {
    //     const template = temp;
    //     // Resolve field mappings in config

    //     const resolvedConfigs = await expressionEvaluator.evaluatePlaceholders(
    //         template.config,
    //         context
    //     );


    //     // Evaluate conditions
    //     if (template.conditions && !this.evaluateConditions(template.conditions, context.params)) {
    //         return { status: 'skipped', reason: 'conditions_not_met' };
    //     }


    //     // console.log(resolvedConfigs, context, resolvePlaceholders(template.config, context), 'RESOLVE PLACE HOLDERS', evaluateStringExpression(JSON.stringify(template.config), context))


    //     // Execute based on tool type
    //     switch (template.tool_type) {
    //         case 'SMS':
    //             return sendSMS({ ...template.config, ...resolvedConfigs, ...context.params });
    //         case 'EMAIL':
    //             return sendEmail(resolvedConfigs);
    //         case 'API_CALL':
    //             return this.callAPI(resolvedConfigs);
    //         case 'AI_ACTION':
    //             return this.callAI(resolvedConfigs, context);
    //         case 'DB_OPERATION':
    //             let dbResult = await this.dbOperation(resolvedConfigs, context);
    //             return dbResult
    //         case 'COMPOSITE':
    //             return this.executeComposite(resolvedConfigs, context);
    //         case 'SCRIPT':
    //             return this.executeScript(resolvedConfigs, context);
    //         case 'SPEAK':
    //             return sendSpeak(resolvedConfigs, context);
    //         default:
    //             throw new Error(`Unsupported tool type: ${template.tool_type}`);
    //     }
    // }
    
    
      async executeAction(template, context) {
    const resolvedConfigs = await expressionEvaluator.evaluatePlaceholders(
      template.config,
      context
    );




    if (template.conditions && !this.evaluateConditions(template.conditions, context.params)) {
      return { status: 'skipped', reason: 'conditions_not_met' };
    }

    let result;
    switch (template.tool_type) {
      case 'SMS':
        result = await sendSMS({ ...resolvedConfigs, ...context.params });
        break;
      case 'EMAIL':
        result = await sendEmail(resolvedConfigs);
        break;
      case 'API_CALL':
        result = await this.callAPI(resolvedConfigs, context);
        break;
      case 'AI_ACTION':
        result = await this.callAI(resolvedConfigs, context);
        break;
      case 'DB_OPERATION':
        result = await this.dbOperation(resolvedConfigs, context);
        break;
      case 'COMPOSITE':
        result = await this.executeComposite(resolvedConfigs, context);
        break;
      case 'SCRIPT':
        result = await this.executeScript(resolvedConfigs, context);
        break;
      case 'SPEAK':
        result = await sendSpeak(resolvedConfigs, context);
        break;
      default:
        throw new Error(`Unsupported tool type: ${template.tool_type}`);
    }



    return result;
  }

    /**
     * Evaluate action conditions
     * @param {object} conditions - Conditions configuration
     * @param {object} context - Execution context
     * @returns {boolean} True if conditions are met
     */
    evaluateConditions(conditions, context) {
        if (!conditions || typeof conditions !== 'object') return true;

        // Evaluate AND conditions
        if (conditions.and) {
            return conditions.and.every(cond =>
                this.evaluateConditions(cond, context)
            );
        }

        // Evaluate OR conditions
        if (conditions.or) {
            return conditions.or.some(cond =>
                this.evaluateConditions(cond, context)
            );
        }

        // Evaluate comparison condition
        if (conditions.field && conditions.operator) {
            const fieldValue = expressionEvaluator.getNestedValue(
                context,
                conditions.field
            );

            const compareValue = conditions.value;

            switch (conditions.operator) {
                case 'eq': return fieldValue == compareValue;
                case 'neq': return fieldValue != compareValue;
                case 'gt': return fieldValue > compareValue;
                case 'gte': return fieldValue >= compareValue;
                case 'lt': return fieldValue < compareValue;
                case 'lte': return fieldValue <= compareValue;
                case 'in': return Array.isArray(compareValue) &&
                    compareValue.includes(fieldValue);
                default: return false;
            }
        }

        return true;
    }

    // Action implementations
    async sendSMS(config) {
        // Implementation using Twilio or similar service
        console.log(`Sending SMS to ${config.to}: ${config.message}`);
        return { status: 'sent', to: config.to, messageId: `sms_${Date.now()}` };
    }

    async sendEmail(config) {
        // Implementation using Nodemailer or similar
        console.log(`Sending email to ${config.to} with subject: ${config.subject}`);
        return { status: 'sent', to: config.to, messageId: `email_${Date.now()}` };
    }

    async callAPI(config, context) {
    const { tenant_id } = context;
        try {
            const { method, url, headers, body } = config;
            const response = await axios({
                method: method || 'GET',
                url,
                data: body,
                headers: {
                    ...headers, "tenant_id": tenant_id
                }
            });


            return response.data
        } catch (err) {
            console.log('API ERROR', err.response)
            throw new Error(`Unsupported api call: ${err.response}`);
        }

    }

    async callAI(config, context) {
        const { conversation_id, message, model_name, system_prompt, temperature, num_ctx, top_p } = config;
            let session = await contextManager.getSession(conversation_id || context.conversation_id);

        let newMessage = expressionEvaluator.evaluatePlaceholders(message, context)


        try {

 
       await contextManager.addMessage(session.id, 'user', message);


            /*      const response = await axios({
                     method: method || 'GET',
                     url,
                     headers,
                     data: body
                 }); */
console.log(newMessage, 'CALL AI', model_name ? model_name : `alayon_model_${context.tenant_id}`)




const ai = await new AIService(session.id, model_name ? model_name : `alayon_model_${context.tenant_id}`).init();




const response = await ai.query(newMessage, {
      systemInstructions: system_prompt,
      context: {...session.context, ...context},
      history: session.history,
    });


       await contextManager.addMessage(session.id, 'assistant', response);

            // const agent = new AIAgent(model_name ? model_name : `alayon_model_${context.tenant_id}`, session.conversation_id);



            // await agent.initialize(context);

            // console.log('[MESSAGE] Processing user input...', newMessage);
            // const response = await agent.generate(newMessage, { temperature, num_ctx, top_p });




            return response
        } catch (err) {
            console.log('AI ERROR', err)
            throw new Error(`Unsupported api call: ${err}`);
        }

    }

    async dbOperation(config, context) {
        const { model, operation, query, data } = config;
        const { tenant_id } = context
        // In a real implementation, this would reference Sequelize models
console.log(config, tenant_id, 'DB CONTEXT')
        switch (operation) {
            case 'delete':
                return db[model].destroy(query);
            case 'update':
                return db[model].update(data, query);
            case 'create':
                return db[model].create({ ...data, ...(tenant_id ? { tenant_id } : {}) });
            case 'find':
                return db[model].findAll({ ...query, raw: true });
            case 'read':
            console.log()
                return db[model].findAll({ ...query, raw: true });
            default:
                throw new Error(`Unsupported DB operation: ${operation}`);
        }
    }

    async executeComposite(config, context) {
            const result = expressionEvaluator.resolvePlaceholders(
                config || {},
                context
            );

        return result;
    }

    executeScript(config, context) {
        // In a real implementation, use a safe sandbox
        console.log(`Executing script: ${config.script}`);
        return { output: "Script executed" };
    }




}