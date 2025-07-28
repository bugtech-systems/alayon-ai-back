import { db } from '../models/index.js';
import { sendEmail, sendSMS, sendSpeak } from './communicationService.js';
import * as expressionEvaluator from './expressionEvaluator.js';
import axios from 'axios';
import { findActionTemplateByName } from './ResourceService.js';
import { resolveConfig, resolveParameters } from '../helpers/parameterResolver.js';

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
    async execute(templateId, parameters = {}, triggerId = null) {
        const template = await db.ActionTemplate.findByPk(templateId);
        if (!template) throw new Error('Action template not found');

        // Create execution context
        this.executionId = generateExecutionId();
        const baseContext = {
            params: parameters,
            outputs: {},
            executionId: this.executionId
        };

        // Create initial audit log
        const auditLog = await db.AuditLog.create({
            action_template_id: templateId,
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
            const result = await this.executeAction(template, baseContext);

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

            return result;
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
            const hookParams = expressionEvaluator.resolveFieldMappings(
                resolveConfig(hook.parameters || {}, context),
                context
            );

            console.log(hookParams, 'HHOOOOK')
            // Execute hook
            const hookResult = await this.executeAction(hookTemplate, {
                ...context,
                params: { ...context.params, ...hookParams }
            });


            console.log(hookResult, 'HHOOOOK RES')

            // console.log(hook, 'hoook', template)
            let output = hook.output_as ? hook.output_as : hookTemplate?.output_as ? hookTemplate?.output_as : name
            // Store hook output
            context.outputs[output] = hookResult;
            console.log(context, 'hoookcobtext')
        }
    }

    /**
     * Execute a single action
     * @param {ActionTemplate} template - Action template
     * @param {object} context - Execution context
     * @returns {Promise<object>} Action result
     */
    async executeAction(temp, context) {
        const template = await db.ActionTemplate.findByPk(temp.id);
        // Resolve field mappings in config


        console.log(template.config, context, 'temp conf')

        const resolvedConfigs = expressionEvaluator.resolveFieldMappings(
            resolveConfig(template.config, context),
            context
        );


        // Evaluate conditions
        if (template.conditions && !this.evaluateConditions(template.conditions, context.params)) {
            return { status: 'skipped', reason: 'conditions_not_met' };
        }


        // Execute based on tool type
        switch (template.tool_type) {
            case 'SMS':
                return sendSMS(resolvedConfigs);
            case 'EMAIL':
                return sendEmail(resolvedConfigs);
            case 'API_CALL':
                return this.callAPI(resolvedConfigs, context);
            case 'DB_OPERATION':
                return this.dbOperation(resolvedConfigs);
            case 'COMPOSITE':
                return this.executeComposite(resolvedConfigs, context);
            case 'SCRIPT':
                return this.executeScript(resolvedConfigs, context);
            case 'SPEAK':
                return sendSpeak(resolvedConfigs);
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
            console.log(config, 'API CALL CONFIG')
            const response = await axios({
                method: method || 'GET',
                url,
                headers,
                data: body
            });

            return response.data
        } catch (err) {
            console.log('API ERROR', err)
            throw new Error(`Unsupported api call: ${err}`);
        }

    }

    async dbOperation(config) {
        const { model, operation, query, data } = config;
        // In a real implementation, this would reference Sequelize models

        switch (operation) {
            case 'delete':
                return db[model].destroy(query);
            case 'update':
                return db[model].update(data, query);
            case 'create':
                return db[model].create(data);
            case 'find':
                return db[model].findAll(query);
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