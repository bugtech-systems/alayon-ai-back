import { ResourceTag } from "../models/resourceTag.model.js";

import fetch from 'node-fetch';
import { removeNullKeys } from "./helpers.js";

/**
 * Generates a structured system + user prompt for Ollama to extract values.
 */
function buildOllamaPrompt(resourceName, fields, userPrompt) {
    const fieldContext = fields.map(f => `- ${f.fieldName} (${f.dataType}): ${f.description}`).join('\n');

    const systemPrompt = `
You are an AI assistant helping extract structured data from user input.
The resource type is "${resourceName}". Here are the fields:

${fieldContext}

Return a JSON object containing only the fields with possible value. Don't Write any description, only plain JSON Object.
`;

    const userMessage = `
User message:
"${userPrompt}"

Extracted JSON:
`;

    return {
        messages: [
            { role: "system", content: systemPrompt.trim() },
            { role: "user", content: userMessage.trim() }
        ]
    };
}

/**
 * Calls the Ollama API for chat completion.
 */
async function callOllamaChat(model, messages) {
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false })
    });

    if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message?.content?.trim() || '{}';
}

/**
 * Extracts field values using Ollama LLM based on the resourceType schema.
 * @param {string} resourceTypeName
 * @param {string} prompt
 * @param {string} model - Ollama model name, e.g., "mistral"
 */
export async function extractFieldsWithOllama(resourceTypeName, prompt, model = "mistral") {
    const resource = await ResourceTag.findOne({
        resourceType: { $regex: new RegExp(resourceTypeName, 'i') }, // partial, case-insensitive
        // name: 'config'
    });
    if (!resource) throw new Error(`Resource type "${resourceTypeName}" not found`);

    const { messages } = buildOllamaPrompt(resource.name, resource.fields, prompt);
    const aiContent = await callOllamaChat(model, messages);

    let extracted = {};
    try {
        extracted = JSON.parse(aiContent);
    } catch (e) {
        console.warn('Failed to parse Ollama output:', aiContent);
    }

    return {
        extracted: removeNullKeys(extracted),
        resourceDefinition: {
            name: resource.name,
            fields: resource.fields
        }
    };
}
