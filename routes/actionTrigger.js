import express from 'express';
import {
    createTemplate,
    getTemplates,
    createTrigger,
    executeNow,
    getAuditLogs,
    cancelTrigger,
    cancelAllTrigger
} from '../controllers/actionController.js';

const router = express.Router();

// Template Management
// router.post('/', createTemplate);
router.get('/', getTemplates);
// router.get('/templates/:id', getTemplate);

// Trigger Management
router.post('/:templateId/triggers', createTrigger);
router.delete('/triggers/all', cancelAllTrigger);
router.delete('/triggers/:triggerId', cancelTrigger);



// Execution
router.post('/:templateId/execute', executeNow);

// Audit Logs
router.get('/audit-logs', getAuditLogs);
// router.get('/audit-logs/:id', getAuditLog);

export default router;