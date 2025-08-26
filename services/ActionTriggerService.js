import { db } from '../models/index.js';
import { scheduleJob, scheduledJobs, cancelJob } from 'node-schedule';
import { sendSMS, sendEmail, sendSpeak } from './communicationService.js';

import { ActionEngine } from '../services/ActionEngine.js';

const actionEngine = new ActionEngine();


export class ActionService {
    static async createTemplate(data) {
        return db.ActionTemplate.create(data);
    }

    static async createTrigger(templateId, triggerData) {
        const template = await db.ActionTemplate.findByPk(templateId);



        const trigger = await db.ActionTrigger.create({
            action_template_id: templateId,
            tool_type: template.tool_type,
            ...triggerData,
        });

        if (trigger.trigger_type !== 'IMMEDIATE') {
            this.scheduleTrigger(trigger);
        } else {
            this.executeImmediately(trigger);
        }
        return trigger;
    }

    static scheduleTrigger(trigger) {
        const jobName = `trigger ${trigger.id}`;

        // Cancel existing job if any
        if (scheduledJobs[jobName]) {
            cancelJob(jobName);
        }

        // Calculate next execution time
        const nextExecution = this.calculateNextExecution(trigger);

        if (!nextExecution) return;

        console.log('NEXT EXECUTION', nextExecution, trigger)

        // Create the scheduled job
        scheduleJob(jobName, nextExecution, async () => {
            try {

                // console.log(jobName, 'SCHEDULED JOB')

                let result = await actionEngine.execute(trigger.action_template_id, trigger.parameters);

                // Update next execution for recurring triggers
                if (trigger.trigger_type === 'RECURRING') {
                    const nextRun = scheduledJobs[jobName]?.nextInvocation();
                    await trigger.update({ next_execution: nextRun });
                } else {
                    await trigger.update({ next_execution: null, is_active: false });
                }
                return result
            } catch (error) {
                console.error(`Trigger execution failed: ${error?.message}`);
            }
        });

        // Update trigger with next execution time


        trigger.update({ next_execution: scheduledJobs[jobName]?.nextInvocation() });
    }

    static cancelTrigger(trigger) {
        const jobName = `trigger ${trigger}`;
        // Cancel existing job if any
        cancelJob(jobName);
        // Calculate next execution time
    }

    static calculateNextExecution(trigger) {
        const config = trigger.trigger_config;

        switch (trigger.trigger_type) {
            case 'SCHEDULED':
                return new Date(config.datetime);

            case 'RECURRING':
                return {
                    rule: config.recurrence_rule ? config.recurrence_rule : "* * * * *",
                    tz: config.timezone || 'UTC'
                };

            case 'COUNTDOWN':
                const execTime = new Date();
                execTime.setSeconds(execTime.getSeconds() + config.delay_seconds);
                return execTime;

            default:
                return null;
        }
    }

    static async executeImmediately(trigger) {
        console.log(trigger, 'TRIGGER')
        const log = await db.AuditLog.create({
            action_type: trigger.tool_type,
            action_template_id: trigger.action_template_id,
            status: 'PENDING',
            executed_at: new Date()
        });

        try {
            await this.executeAction(trigger.action_template_id, trigger.parameters, log.id);
            await log.update({ status: 'COMPLETED', completed_at: new Date() });
        } catch (error) {
            console.log(error, 'ERR')
            await log.update({
                status: 'FAILED',
                error_details: error.message,
                completed_at: new Date()
            });
        }
    }

    static async executeAction(templateId, parameters, logId = null) {
        const template = await db.ActionTemplate.findByPk(templateId);
        if (!template) throw new Error('Template not found');


        console.log('exxec', parameters)

        let log;
        if (!logId) {
            log = await db.AuditLog.create({
                action_type: template.tool_type,
                action_template_id: templateId,
                request_data: parameters,
                status: 'RUNNING',
                executed_at: new Date()
            });
        } else {
            log = await db.AuditLog.findByPk(logId);
            await log.update({ status: 'RUNNING' });
        }



        try {
            let result;
            switch (template.tool_type) {
                case 'SMS':
                    result = await sendSMS(template.config);
                    break;
                case 'Email':
                    result = await sendEmail(template.config);
                    break;
                case 'API_CALL':
                    result = await this.executeApiCall(template.config);
                    break;
                case 'DB_OPERATION':
                    result = await this.executeDbOperation(template.config);
                    break;
                case 'COMPOSITE':
                    result = await actionEngine.executeComposite(template.config, parameters);
                    break;
                case 'Speak':
                    result = await sendSpeak(template.config, parameters);
                    break;
                default:
                    throw new Error('Unsupported action type');
            }

            await log.update({
                status: 'COMPLETED',
                response_data: result,
                completed_at: new Date()
            });

            return result;
        } catch (error) {
            await log.update({
                status: 'FAILED',
                error_details: error.message,
                completed_at: new Date()
            });
            throw error;
        }
    }

    // ... implementation of executeApiCall, executeDbOperation, etc.
}