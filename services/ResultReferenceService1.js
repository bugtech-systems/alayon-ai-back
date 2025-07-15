import { db } from '../models/index.js';
import crypto from 'crypto';
import cron from 'node-cron';

class ResultReferenceService {
    async createResultReference(templateId, results, ttlMinutes = 60) {
        const executionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + ttlMinutes * 60000);

        try {
            await db.TemplateExecutionResult.create({
                execution_id: executionId,
                template_id: templateId,
                results,
                expires_at: expiresAt
            });

            return executionId;
        } catch (error) {
            console.error('Failed to create result reference:', error);
            throw new Error('Failed to create result reference');
        }
    }

    async resolveReference(reference) {
        if (!reference?.startsWith('$result.')) {
            return { value: reference, isReference: false };
        }

        try {
            const parts = reference.replace('$result.', '').split('.');
            const executionId = parts[0];
            const path = parts.slice(1).join('.');

            const result = await db.TemplateExecutionResult.findOne({
                where: { execution_id: executionId }
            });

            if (!result) {
                throw new Error(`Result reference ${executionId} not found`);
            }

            if (result.expires_at && new Date(result.expires_at) < new Date()) {
                throw new Error(`Result reference ${executionId} has expired`);
            }

            const value = this.getNestedValue(result.results, path);
            return { value, isReference: true };
        } catch (error) {
            console.error('Reference resolution failed:', error);
            return { value: null, isReference: false, error: error.message };
        }
    }

    getNestedValue(obj, path) {
        if (!path) return obj;
        return path.split('.').reduce((o, p) => {
            if (o && typeof o === 'object' && p in o) {
                return o[p];
            }
            return undefined;
        }, obj);
    }

    async processResourceValues(resourceValues) {
        if (!Array.isArray(resourceValues)) {
            throw new Error('resourceValues must be an array');
        }

        const processed = [];

        for (const value of resourceValues) {
            try {
                if (value?.value_reference) {
                    const { value: resolvedValue } = await this.resolveReference(value.value_reference);
                    processed.push({
                        ...value.toJSON(),
                        resolved_value: resolvedValue
                    });
                } else {
                    processed.push(value.toJSON());
                }
            } catch (error) {
                console.error('Failed to process resource value:', error);
                processed.push({
                    ...value.toJSON(),
                    error: 'Failed to process value'
                });
            }
        }

        return processed;
    }

    async cleanupExpiredReferences() {
        try {
            const deletedCount = await db.TemplateExecutionResult.destroy({
                where: {
                    expires_at: {
                        [db.Sequelize.Op.lt]: new Date()
                    }
                }
            });
            console.log(`Cleaned up ${deletedCount} expired references`);
            return deletedCount;
        } catch (error) {
            console.error('Failed to cleanup expired results:', error);
            return 0;
        }
    }
}

// Create singleton instance
const resultReferenceService = new ResultReferenceService();

// Schedule daily cleanup at midnight
cron.schedule('0 0 * * *', async () => {
    await resultReferenceService.cleanupExpiredReferences();
});

// Export both the instance and the class
export { ResultReferenceService, resultReferenceService as default };