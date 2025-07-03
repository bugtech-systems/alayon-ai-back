import express from 'express';
import FineTuneController from '../controllers/fineTuneController.js';

const router = express.Router();

// List available datasets
router.get('/datasets', FineTuneController.listDatasets);

router.delete('/datasets', FineTuneController.deleteDatasets);


router.get('/conversations', FineTuneController.getConversations);

// Start fine-tuning job
router.post('/fine-tune', FineTuneController.startFineTuning);

// List fine-tuned models
router.get('/models', FineTuneController.listModels);

// Get model details
router.get('/models/:modelName', FineTuneController.getModel);

// Delete a model
router.delete('/models/:modelName', FineTuneController.deleteModel);

// Check fine-tuning status
router.get('/jobs/:jobId/status', FineTuneController.checkJobStatus);

router.get('/rate/:conversationId/:rate', FineTuneController.rateConversation);

export default router;