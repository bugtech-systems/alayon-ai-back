// services/aiService.js
import axios from "axios";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ResourceTag } from "../models/resourceTag.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const default_prompts = path.join(__dirname, '..', 'backend', 'default_prompts.json');

const PYTHON_BASE_URL = process.env.PYTHON_AI_API || "http://127.0.0.1:8000/api";



export const processPrompt = async (userPrompt) => {
    try {
        const defaultPromptsPath = path.join(__dirname, '../data/default_prompts.json');
        // const defaultPrompts = await readFile(defaultPromptsPath, 'utf-8');

        const payload = {
            ...userPrompt
        };
        const response = await axios.post(`${PYTHON_BASE_URL}/prompt`, payload);
        const result = response.data;


        return result;
    } catch (err) {
        // console.error('[processPrompt] Error:', err);
        return {
            message: "Failed to process prompt",
            intent: "error",
            data: { error: err.message }
        };
    }
};



export const analyzePrompt = async (payload) => {
    try {
        const DEFAULT_PROMPTS = await fs.readFile(default_prompts, 'utf-8');

        // Get all resourceTypes with name: "config"
        const resourceConfigs = await ResourceTag.find({ name: 'config' }).lean();
        const aiPresets = await ResourceTag.find({ resourceType: 'ai_preset', name: { $ne: 'config' } }).lean();


        // Extract unique resourceTypes and structure fields
        const resourceTypes = resourceConfigs.map(config => ({
            resourceType: config.resourceType,
            fields: config.fields?.map(v => v.fieldName) || []
        }));

        const aiResources = aiPresets.map(config => {
            const valuesObject = (config.values || []).reduce((acc, { fieldName, value }) => {
                acc[fieldName] = value;
                return acc;
            }, {});

            return {
                resourceType: config.resourceType,
                name: config.name,
                description: valuesObject['description'],
                keywords: valuesObject['keywords']
            };
        });



        const instruction = `
You are an AI assistant specialized in refining and interpreting user prompts for querying structured resource data. And selects the most appropriate ai_preset.

Your tasks:

1. From the provided \`data\`, select **only one** \`resourceType\` that best matches the \`user_prompt\`.
2. Retrieve the list of \`fields\` for the chosen \`resourceType\`.
3. Analyze the \`user_prompt\` and extract key-value pairs **only for keys present in the \`fields\` list**; ignore all others.
4. If a field key appears (fully or partially) in the prompt, extract the corresponding value next to it, extract also key value from previous messages.
5. Refine and clarify the \`user_prompt\` without changing its meaning if it's not related to previous prompt.
6. Respond strictly in the exact structured JSON format without explanations or additional text.
7. Select the most relevant ai_preset from the provided \`data\`, select **only one** \`ai_preset name\` that best matches the \`user_prompt\.`;

        const defaultInstruction = `
You are Alayon AI Assistant.

Your task is to analyze the given user_prompt and provide an accurate, SMS-friendly response **based strictly on the provided data array**. Do not assume or generate answers outside of what is present in the data. Only respond to what is specifically asked in the prompt.

Instructions:
1. Understand the intent and question in the "user_prompt".
2. Search and match relevant information in the "data" array to answer the question clearly and accurately.
3. Only respond if the data contains enough information to confidently answer the prompt.
4. If you're unsure or if the data does not cover the question, reply politely and precisely that you can't find any data."
5. Keep the response message SMS-friendly, clear, short yet detailed, and human-readable. minimum of 500 - 700 Characters long.
6. Respond strictly in the exact structured JSON format additional text.
`;



        const prompt = {
            session_id: `analyze_${payload.sessionId}`,
            instruction,
            expected_output_format: {
                prompt: "string",
                preset: "string",
                resourceType: "string",
                filters: {
                    fieldName: "value"
                }
            },
            data: [
                // { name: "Default Prompts", data: JSON.parse(DEFAULT_PROMPTS) },
                { name: "Resource Types", data: resourceTypes },
                { name: "Available AI Presets", data: aiResources }
            ],
            user_prompt: payload.user_prompt
        };



        console.log(prompt, 'ANALYZE PROMPT')
        const res = await axios.post(`${PYTHON_BASE_URL}/prompt`, prompt);

        if (res?.data) {
            return {
                success: true,
                instruction: defaultInstruction,
                expected_output_format: {
                    message: "string",
                    data: [],
                    actions: []
                },
                ...res?.data?.response,
                session_id: payload.sessionId,
            };
        }

        return {
            success: false,
            ...payload,
            prompt: payload.user_prompt,
            session_id: payload.sessionId,

        };

    } catch (err) {
        // console.error("[analyzePrompt] AI resource-analyze error:", err);
        return {
            success: false,
            message: "Analysis service failed",
            error: err.message
        };
    }
};