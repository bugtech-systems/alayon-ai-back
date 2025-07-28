import { ActionService } from '../services/ActionTriggerService.js';
import { db } from '../models/index.js';

export class ActionWorker {
    static async start() {
        // Load pending triggers on startup
        const triggers = await db.ActionTrigger.findAll({
            where: { is_active: true }
        });

        triggers.forEach(trigger => {
            if (trigger.trigger_type !== 'IMMEDIATE') {
                ActionService.scheduleTrigger(trigger);
            }
        });

        // Cleanup completed logs older than 30 days
        setInterval(async () => {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);

            await db.AuditLog.destroy({
                where: {
                    status: 'COMPLETED',
                    completed_at: { [Op.lt]: cutoffDate }
                }
            });
        }, 24 * 60 * 60 * 1000); // Daily
    }
}