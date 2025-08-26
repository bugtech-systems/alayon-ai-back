import { db } from '../models/index.js';
import { sendEmail, sendSMS, sendSpeak } from './communicationService.js';
import * as expressionEvaluator from './expressionEvaluator.js';
import axios from 'axios';
import { findActionTemplateByName } from './ResourceService.js';
import { AIAgent } from '../services/aiAgent.js';
import { sessionManager } from '../services/sessionStore.js';

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
        console.log(temp, parameters, 'TEMPLATE EXECUTE')

        const template = await db.ActionTemplate.findByPk(temp?.id);
        if (!template) throw new Error('Action template not found');

        // Create execution context
        this.executionId = generateExecutionId();
        const baseContext = {
            params: parameters,
            outputs: {},
            executionId: this.executionId,
            tenant_id: template.tenant_id
        };



        // Create initial audit log
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
            // Process pre-hooks
            if (template.pre_hooks) {
                await this.processHooks(template.pre_hooks, baseContext);
            }


            // Execute main action
            const result = await this.executeAction(temp, baseContext);

            // Store main result
            baseContext.outputs.main = result;



            // Process post-hooks
            if (template.post_hooks) {
                await this.processHooks(template.post_hooks, baseContext);
            }

            // Update audit log
            await auditLog.update({
                status: 'COMPLETED',
                completed_at: new Date(),
                response_data: result,
                context: baseContext
            });

            return { data: result, context: baseContext };
        } catch (error) {
            console.log(error, 'err')
            await auditLog.update({
                status: 'FAILED',
                completed_at: new Date(),
                error_details: error.message
            });
            throw error?.response?.data;
        }
    }

    /**
     * Process pre/post hooks
     * @param {object[]} hooks - Array of hook definitions
     * @param {object} context - Execution context
     */
    async processHooks(hooks, context) {
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
    }

    /**
     * Execute a single action
     * @param {ActionTemplate} template - Action template
     * @param {object} context - Execution context
     * @returns {Promise<object>} Action result
     */
    async executeAction(temp, context) {
        const template = temp;
        // Resolve field mappings in config
        console.log(temp.id, 'EXECUTE', context, 'CONTEXT')

        const resolvedConfigs = await expressionEvaluator.evaluatePlaceholders(
            template.config,
            context
        );
        // console.log('EXECUTE CONFIG', JSON.stringify(resolvedConfigs), JSON.stringify(temp.config), context)


        // Evaluate conditions
        if (template.conditions && !this.evaluateConditions(template.conditions, context.params)) {
            return { status: 'skipped', reason: 'conditions_not_met' };
        }


        // console.log(resolvedConfigs, context, resolvePlaceholders(template.config, context), 'RESOLVE PLACE HOLDERS', evaluateStringExpression(JSON.stringify(template.config), context))


        // Execute based on tool type
        switch (template.tool_type) {
            case 'SMS':
                return sendSMS({ ...template.config, ...resolvedConfigs, ...context.params });
            case 'EMAIL':
                return sendEmail(resolvedConfigs);
            case 'API_CALL':
                return this.callAPI(resolvedConfigs);
            case 'AI_ACTION':
                return this.callAI(resolvedConfigs, context);
            case 'DB_OPERATION':
                let dbResult = await this.dbOperation(resolvedConfigs, context);
                console.log(dbResult, 'DB RESULT')
                return dbResult
            case 'COMPOSITE':
                return this.executeComposite(resolvedConfigs, context);
            case 'SCRIPT':
                return this.executeScript(resolvedConfigs, context);
            case 'SPEAK':
                return sendSpeak(resolvedConfigs, context);
            default:
                throw new Error(`Unsupported tool type: ${template.tool_type}`);
        }
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

    async callAPI(config) {
        try {
            const { method, url, headers, body } = config;
            console.log('CALL API', config)
            const response = await axios({
                method: method || 'GET',
                url,
                data: body,
                headers
            });


            console.log('CALL API RESPONSE', response.data, 'config', config)
            return response.data
        } catch (err) {
            console.log('API ERROR', err.response)
            throw new Error(`Unsupported api call: ${err.response}`);
        }

    }

    async callAI(config, context) {
        const { conversation_id, message, model_name, system_prompt, temperature, num_ctx, top_p } = config;
        console.log(config, 'AI CONFIGGG', context)
        let session = await sessionManager.getSession(conversation_id);
        let newMessage = expressionEvaluator.evaluatePlaceholders(message, context)


        try {

            if (!session) {
                console.log('[Session] Creating new session');
                session = await sessionManager.createSession(conversation_id);

            } else {
                console.log(`[Session] Using existing session: ${session.id}`);
            }



            /*      const response = await axios({
                     method: method || 'GET',
                     url,
                     headers,
                     data: body
                 }); */

            console.log(config, context, 'AI CALL')


            const agent = new AIAgent(model_name ? model_name : `alayon_model_${context.tenant_id}`, session.conversation_id);



            await agent.initialize(context);

            console.log('[MESSAGE] Processing user input...', newMessage);
            const response = await agent.generate(newMessage, { temperature, num_ctx, top_p });




            console.log(config, context, 'AI AGENT RESPONSE', response)
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

        console.log(config, 'DB OPERATION')

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
                return db[model].findAll({ ...query, raw: true });
            default:
                throw new Error(`Unsupported DB operation: ${operation}`);
        }
    }

    async executeComposite(config, context) {
        const results = {};
        for (const action of config.actions) {
            const template = await db.ActionTemplate.findByPk(action.templateId);
            const params = expressionEvaluator.resolveFieldMappings(
                action.parameters || {},
                context
            );


            results[action.as] = await this.executeAction(template, {
                ...context,
                params: { ...context.params, ...params }
            });


            // Update context with sub-action result
            context.outputs[action.as] = results[action.as];
        }
        return results;
    }

    executeScript(config, context) {
        // In a real implementation, use a safe sandbox
        console.log(`Executing script: ${config.script}`);
        return { output: "Script executed" };
    }

    textToSpeech(config) {
        console.log(`Converting to speech: ${config.text}`);
        return { audioUrl: `https://example.com/audio/${Date.now()}.mp3` };
    }

    // resolveParameters(config, context) {
    //     // Deep clone config to avoid mutation
    //     const resolved = JSON.parse(JSON.stringify(config));

    //     // Recursive resolution function
    //     const resolve = (obj) => {
    //         for (const key in obj) {
    //             if (typeof obj[key] === 'string' && obj[key].startsWith('=')) {
    //                 // Evaluate expression in sandbox
    //                 const expression = obj[key].substring(1);
    //                 try {
    //                     const sandbox = { ...context, ...context.params };
    //                     vm.createContext(sandbox);
    //                     obj[key] = vm.runInContext(expression, sandbox);
    //                 } catch (error) {
    //                     throw new Error(`Expression evaluation failed: ${expression} - ${error.message}`);
    //                 }
    //             } else if (typeof obj[key] === 'object') {
    //                 resolve(obj[key]);
    //             }
    //         }
    //     };

    //     resolve(resolved);
    //     return resolved;
    // }


}