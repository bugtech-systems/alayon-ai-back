import express from 'express';
import { handleChat, queryResource } from '../controllers/conversationController.js';

const router = express.Router();
router.post('/', handleChat);
router.post('/query', queryResource)
export default router;

