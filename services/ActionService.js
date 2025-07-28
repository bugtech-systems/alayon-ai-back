import { db } from '../models/index.js';
import axios from 'axios';
import { sendSMS, sendEmail } from './communicationService.js';
import { resolveParameters } from '../helpers/parameterResolver.js';

export class ActionService {
    /**
     * Execute a composite template with chained actions
     * @param {string} templateId - ID of the composite template
     * @param {object} parameters - Initial parameters for execution
     * @param {string} initiator - Who initiated the execution
     * @returns {object} - Final execution result
     */
    static async executeCompositeTemplate(templateId, parameters, initiator = 'system') {
        const template = await db.ActionTemplate.findByPk(templateId);
        if (!template || template.tool_type !== 'COMPOSITE') {
            throw new Error('Invalid composite template');
        }

        // const executionId = uuidv4();

        const trigger = await db.ActionTrigger.create({
            action_template_id: templateId,
            tool_type: template.tool_type,
            ...parameters
        });



        const executionId = trigger.id;
        const context = { ...parameters };
        const executionLog = [];

        const mainLog = await db.AuditLog.create({
            action_template_id: templateId,
            status: 'RUNNING',
            executed_at: new Date(),
            execution_id: trigger.id,
            initiator,
            request_data: context
        });

        // this.createAuditLog(templateId, initiator, executionId);

        try {
            // Execute pre-hooks
            for (const hook of template.pre_hooks || []) {
                const result = await this.executeSingleAction(
                    hook.template_id,
                    resolveParameters(hook.parameters || {}, context),
                    executionId
                );
                executionLog.push(result);

                this.mergeContext(context, result.output, hook.output_as);
            }

            // Execute main actions
            for (const action of template.config.actions || []) {
                if (action.depends_on && !action.depends_on.every(dep =>
                    executionLog.some(log => log.step_name === dep && log.status === 'COMPLETED'))
                ) {
                    continue;
                }

                if (action.condition && !this.evaluateCondition(action.condition, context)) {
                    continue;
                }

                const result = await this.executeSingleAction(
                    action.template_id,
                    resolveParameters(action.parameters, context),
                    executionId,
                    action.name
                );

                executionLog.push(result);
                this.mergeContext(context, result.output, action.output_as);

                if (action.delay) {
                    await new Promise(resolve => setTimeout(resolve, action.delay * 1000));
                }
            }

            // Execute post-hooks
            for (const hook of template.config.post_hooks || []) {
                if (hook.run_always || executionLog.every(log => log.status === 'COMPLETED')) {
                    const result = await this.executeSingleAction(
                        hook.template_id,
                        resolveParameters(hook.parameters, context),
                        executionId
                    );
                    executionLog.push(result);
                }
            }

            // Prepare final output
            const finalOutput = {};
            for (const [key, valuePath] of Object.entries(template.config.output_mapping || {})) {
                finalOutput[key] = this.resolveValue(valuePath, context);
            }

            await mainLog.update({
                status: 'COMPLETED',
                context: JSON.stringify(context),
                execution_time: Date.now() - mainLog.createdAt
            });

            return {
                execution_id: executionId,
                status: 'COMPLETED',
                context,
                output: finalOutput,
                steps: executionLog
            };
        } catch (error) {
            await mainLog.update({
                status: 'FAILED',
                error_details: error.message,
                execution_time: Date.now() - mainLog.createdAt
            });
            throw error;
        }
    }

    /**
     * Execute a single action template
     * @param {string} templateId - Action template ID
     * @param {object} parameters - Execution parameters
     * @param {string} executionId - Parent execution ID (for composite)
     * @param {string} stepName - Step name (for composite)
     * @returns {object} - Execution result
     */
    static async executeSingleAction(templateId, parameters, executionId, stepName) {
        const template = await db.ActionTemplate.findByPk(templateId);
        if (!template) throw new Error(`Template not found: ${templateId}`);


        /*        const trigger = await db.ActionTrigger.create({
                   action_template_id: templateId,
                   tool_type: template.tool_type,
                   ...parameters
               });
       
               const executionId = trigger.id; */

        const auditLog = await db.AuditLog.create({
            action_template_id: templateId,
            status: stepName,
            executed_at: new Date(),
            execution_id: executionId,
            request_data: parameters
        });




        try {
            let output;
            const startTime = Date.now();

            switch (template.tool_type) {
                case 'SMS':
                    output = await sendSMS(resolveParameters(template.config, parameters));
                    break;
                case 'EMAIL':
                    output = await sendEmail(resolveParameters(template.config, parameters));
                    break;
                case 'API_CALL':
                    output = await this.executeApiCall(resolveParameters(template.config, parameters));
                    break;
                case 'DB_OPERATION':
                    output = await this.executeDbOperation(resolveParameters(template.config, parameters));
                    break;
                case 'SCRIPT':
                    output = await this.executeScript(template.config, parameters);
                    break;
                default:
                    throw new Error(`Unsupported action type: ${template.tool_type}`);
            }

            await auditLog.update({
                status: 'COMPLETED',
                output: JSON.stringify(output),
                execution_time: Date.now() - startTime
            });

            return {
                template_id: templateId,
                step_name: stepName,
                status: 'COMPLETED',
                output,
                execution_time: Date.now() - startTime
            };
        } catch (error) {
            await auditLog.update({
                status: 'FAILED',
                error_details: error.message,
                execution_time: Date.now() - auditLog.createdAt
            });
            throw error;
        }
    }

    static async executeDbOperation(config) {
        const { model, operation, query } = config;

        switch (operation) {
            case 'DELETE':
                return db[model].destroy(query);
            case 'UPDATE':
                return db[model].update(query.data, query.where);
            case 'CREATE':
                return db[model].create(query);
            default:
                throw new Error(`Unsupported DB operation: ${operation}`);
        }
    }

    static async executeApiCall(config) {
        const { method, url, headers, body } = config;

        console.log(url, method, body)

        const response = await axios({
            method,
            url,
            headers,
            data: body
        });
        return response.data;
    }

    static evaluateCondition(expression, context) {
        try {
            const expr = expression.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
                return this.resolveValue(path, context);
            });
            return new Function(`return ${expr}`)();
        } catch (error) {
            console.error(`Condition evaluation failed: ${error}`);
            return false;
        }
    }

    static mergeContext(context, newData, namespace) {
        if (!namespace) {
            // Merge properties directly into context
            Object.assign(context, newData);
        } else {
            // Create or update namespaced property
            if (!context[namespace]) {
                context[namespace] = {};
            }
            Object.assign(context[namespace], newData);
        }

        // Special handling for array outputs
        if (Array.isArray(newData)) {
            context[namespace] = [...newData];
        }

        return context;
    }

    static resolveParameters(parameters, context) {
        if (!parameters) return {};
        return Object.fromEntries(
            Object.entries(parameters).map(([key, value]) => [
                key,
                typeof value === 'string' ?
                    this.resolveValue(value, context) :
                    value
            ])
        );
    }

    static resolveValue(path, context) {
        return path.split('.').reduce((obj, key) => obj?.[key], context);
    }

    static mapOutputs(result, outputAs) {
        if (!outputAs) return {};
        return { [outputAs]: result };
    }

    // Helper methods (resolveParameters, evaluateCondition, etc.)
    // ... (implementation from previous examples) ...
}

// // Communication service implementations
// export const sendSMS = async (config) => {
//     // Implementation for SMS providers
// };

// export const sendEmail = async (config) => {
//     // Implementation for email sending
// };