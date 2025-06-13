import express from 'express';
import { processDynamicChat } from '../controllers/dynamicChatController.js';

const router = express.Router();
router.post('/', processDynamicChat);

export default router;
