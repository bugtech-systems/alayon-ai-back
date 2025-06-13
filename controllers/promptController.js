// controllers/promptController.js
import { processPrompt, analyzePrompt } from "../services/promptService.js";
import { ResourceTag } from "../models/resourceTag.model.js";
import { getFilteredResources } from "../services/resourceService.js";

export const handlePrompt = async (req, res) => {
    const { prompt, sessionId = "default-session" } = req.body;

    console.log("[handlePrompt] Received prompt request:");
    console.log("→ sessionId:", sessionId);
    console.log("→ prompt:", prompt);

    if (!prompt) {
        console.warn("[handlePrompt] Missing prompt in request body");
        return res.status(400).json({ error: "Prompt is required" });
    }

    try {
        const result = await processPrompt(prompt);

        console.log("[handlePrompt] Processed prompt result:");
        console.log("→ intent:", result.intent);
        console.log("→ message:", result.message);

        const logEntry = {
            resourceType: "PromptLog",
            name: sessionId,
            values: [
                { fieldName: "prompt", value: prompt },
                { fieldName: "response", value: result.message },
                { fieldName: "intent", value: result.intent },
                { fieldName: "timestamp", value: new Date().toISOString() }
            ]
        };

        console.log("[handlePrompt] Logging prompt to database:", JSON.stringify(logEntry, null, 2));

        // await ResourceTag.create(logEntry);

        res.json({ sessionId, ...result });
    } catch (err) {
        console.error("[handlePrompt] Failed to process prompt:", err.stack);
        res.status(500).json({ error: "Failed to process prompt" });
    }
};

export const getPrompts = async (req, res) => {
    const { sessionId } = req.query;

    const query = { resourceType: "PromptLog" };
    if (sessionId) {
        query.name = sessionId;
    }

    console.log("[getPrompts] Fetching prompts with query:", query);

    try {
        const prompts = await ResourceTag.find(query).lean();

        console.log(`[getPrompts] Found ${prompts.length} prompt logs`);

        const structured = prompts.map((p) => {
            const obj = { id: p._id, sessionId: p.name };
            p.values.forEach((v) => {
                obj[v.field] = v.value;
            });
            return obj;
        });

        console.log("[getPrompts] Structured response:", structured);

        res.json(structured);
    } catch (err) {
        console.error("[getPrompts] Error fetching prompt logs:", err.stack);
        res.status(500).json({ error: "Failed to fetch prompt logs" });
    }
};

export const handleAnalyzePrompt = async (req, res) => {
    const { sessionId, prompt } = req.body;

    console.log("[handleAnalyzePrompt] Incoming request:");
    console.log("→ sessionId:", sessionId);
    console.log("→ prompt:", prompt);

    if (!sessionId || !prompt) {
        console.warn("[handleAnalyzePrompt] Missing sessionId or prompt");
        return res.status(400).json({ error: "sessionId and prompt are required" });
    }

    try {
        let data = [];
        const result = await analyzePrompt({ user_prompt: prompt, sessionId });
        console.log(result, 'RESS')
        if (result.success) {
            let { resourceType, filters } = result;
            data = await getFilteredResources(resourceType, filters)

        }

        let { prompt: user_prompt, expected_output_format, instruction } = result;


        const promptResult = await processPrompt({ session_id: sessionId, data, instruction, expected_output_format, user_prompt });

        console.log("[handlePrompt] Processed prompt result:");
        console.log("→ intent:", promptResult.intent);
        console.log("→ message:", result.message);

        // const logEntry = {
        //     resourceType: "PromptLog",
        //     name: sessionId,
        //     values: [
        //         { field: "prompt", value: prompt },
        //         { field: "response", value: result.message },
        //         { field: "intent", value: result.intent },
        //         { field: "timestamp", value: new Date().toISOString() }
        //     ]
        // };

        // console.log("[handlePrompt] Logging prompt to database:", JSON.stringify(logEntry, null, 2));

        // await ResourceTag.create(logEntry);

        // res.json({ sessionId, ...result });



        console.log("[handleAnalyzePrompt] Analysis result:", result);

        res.json({ sessionId, ...promptResult, data, result });
    } catch (err) {
        console.error("[handleAnalyzePrompt] Error analyzing prompt:", err);
        res.status(500).json({ error: "Failed to analyze prompt" });
    }
};
