import { scheduleJob, scheduledJobs, cancelJob } from 'node-schedule';
import { ActionService } from '../services/ActionTriggerService.js';
import { db } from '../models/index.js';
import { Op } from 'sequelize';
import { ActionEngine } from '../services/ActionEngine.js';
import { findActionTemplateByName } from '../services/ResourceService.js';

const actionEngine = new ActionEngine();


class SchedulerWorker {
    static async init() {
        // Load active triggers on startup
        await this.loadActiveTriggers();

        // Setup periodic check for missed triggers (every 5 minutes)
        setInterval(() => this.checkMissedTriggers(), 1 * 60 * 1000);
        console.log('INITIALIZING MISSED TRIGGERS')

    }

    static async loadActiveTriggers() {
        const activeTriggers = await db.ActionTrigger.findAll({
            where: {
                is_active: true,
                trigger_type: {
                    [Op.in]: ['SCHEDULED', 'RECURRING', 'COUNTDOWN']
                }
            },
            include: [db.ActionTemplate]
        });

        activeTriggers.forEach(trigger => {
            this.scheduleTrigger(trigger);
        });
    }

    static scheduleTrigger(trigger) {
        const jobName = `trigger ${trigger.id}`;

        // Cancel existing job if any
        if (scheduledJobs[jobName]) {
            cancelJob(jobName);
        }

        // Calculate next execution time
        const nextExecution = this.calculateNextExecution(trigger);

        console.log(nextExecution, jobName, 'SCHEDULED TRIGGER')
        if (!nextExecution) return;



        // Create the scheduled job
        scheduleJob(jobName, nextExecution, async () => {
            try {

                console.log(jobName, 'SCHEDULED JOB Worker', trigger)
                const template = await findActionTemplateByName(trigger.action_template_id);

                // await ActionService.executeAction(trigger.action_template_id, { message: `${jobName} Hello There.` });
                await actionEngine.execute(template, trigger.parameters);

                // Update next execution for recurring triggers
                if (trigger.trigger_type === 'RECURRING') {
                    const nextRun = scheduledJobs[jobName]?.nextInvocation();
                    await trigger.update({ next_execution: nextRun });
                } else {
                    await trigger.update({ next_execution: null, is_active: false });
                }
            } catch (error) {
                console.error(`Trigger execution failed: ${error?.message}`);
            }
        });

        // Update trigger with next execution time

        if (trigger.trigger_type === 'RECURRING') {
            trigger.update({ next_execution: scheduledJobs[jobName]?.nextInvocation() });
        } else {
            trigger.update({ next_execution: null, is_active: false });
        }
    }

    static calculateNextExecution(trigger) {
        const config = trigger.trigger_config;

        switch (trigger.trigger_type) {
            case 'SCHEDULED':
                return new Date(config.datetime);

            case 'RECURRING':
                return {
                    rule: config.recurrence_rule,
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

    static async checkMissedTriggers() {
        const now = new Date();
        const missedTriggers = await db.ActionTrigger.findAll({
            where: {
                is_active: true,
                next_execution: {
                    [Op.lt]: now,
                    [Op.ne]: null
                }
            }
        });



        for (let trigger of missedTriggers) {

            console.log(`Executing missed trigger: ${trigger.id}`);
            this.scheduleTrigger(trigger);
            const jobName = `trigger_${trigger.id}`;

            let triggerAction = await findActionTemplateByName(trigger.action_template_id);

            actionEngine.execute(triggerAction, trigger.parameters, trigger.id);
            // ActionService.executeAction(trigger.action_template_id, trigger.parameters);
        }

        /*      missedTriggers.forEach(trigger => {
     
             }); */
    }
}

export default SchedulerWorker;