// routers/promptRoutes.js
import express from "express";
import { handlePrompt, getPrompts, handleAnalyzePrompt } from "../controllers/promptController.js";
import { chatPrompt } from "../controllers/chatController.js";

const router = express.Router();

router.post("/", handlePrompt);
router.get("/", getPrompts); // <-- add this line
router.post("/analyze", handleAnalyzePrompt);
router.post("/chat", chatPrompt);

export default router;
