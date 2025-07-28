import express from 'express';
import { db } from '../models/index.js';

const router = express.Router();

// Get execution logs
router.get('/logs', async (req, res) => {
    try {
        const { page = 1, limit = 50, ...query } = req.query;
        const logs = await db.AuditLog.findAll({
            where: query,
            include: [db.ActionTemplate],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: (page - 1) * limit
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get details of a specific execution
router.get('/executions/:executionId', async (req, res) => {
    try {
        const logs = await db.AuditLog.findAll({
            where: { execution_id: req.params.executionId },
            include: [db.ActionTemplate],
            order: [['created_at', 'ASC']]
        });

        if (logs.length === 0) {
            return res.status(404).json({ error: 'Execution not found' });
        }

        res.json({
            execution_id: req.params.executionId,
            status: logs[0].status,
            steps: logs
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;