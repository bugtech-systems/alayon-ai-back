// src/api/chatHandler.js
import { getDefaultsFromDB, queryMongo, saveToMongo } from '../services/dbService.js';
import { refinePromptWithOllama } from '../services/ollamaService.js';

// In-memory session store
const sessionStore = {};

export async function chatHandler(req, res) {
    const userInput = (req.body.message || '').trim();
    const sessionId = req.body.sessionId;

    if (!sessionId) {
        return res.status(400).json({ message: 'Missing sessionId in request body.' });
    }

    if (!sessionStore[sessionId]) {
        sessionStore[sessionId] = {
            organization: null,
            resourceType: null,
            action: null,
            queryfields: {},
            status: 'init',
        };
    }

    const ctx = sessionStore[sessionId];

    // Fetch defaults based on resourceType availability
    const defaults = ctx.resourceType
        ? await getDefaultsFromDB(ctx.resourceType)
        : await getDefaultsFromDB();

    let response = '';

    if (!ctx.organization) {
        response = `Hi! I'm your assistant. What organization are you inquiring about? Options: ${defaults.organizations.join(', ')}`;
    } else if (!ctx.resourceType) {
        response = `Thanks! What type of resource do you need help with? Options: ${defaults.resourceTypes.join(', ')}`;
    } else if (!ctx.action) {
        response = `What would you like to do with the ${ctx.resourceType}? Options: Create, Get, Update, Delete.`;
    } else if (ctx.action && Object.keys(ctx.queryfields).length < (defaults.requiredFields || []).length) {
        const requiredFields = defaults.requiredFields || [];
        const pending = requiredFields.find(f => !(f in ctx.queryfields));
        const options = (defaults.fieldOptions && defaults.fieldOptions[pending])?.join(', ') || 'any';
        response = `Please provide a value for "${pending}". Options: ${options}`;
    } else if (ctx.status !== 'submit') {
        ctx.status = 'submit';
        response = `You've selected Organization: ${ctx.organization}, Resource: ${ctx.resourceType}, Action: ${ctx.action}. Ready to proceed? (yes/no)`;
    } else if (userInput.toLowerCase() === 'yes') {
        let result;
        switch (ctx.action.toLowerCase()) {
            case 'create':
                result = await saveToMongo(ctx);
                response = `✅ ${ctx.resourceType} created successfully.`;
                break;
            case 'get':
                result = await queryMongo(ctx.resourceType, ctx.queryfields);
                response = `📦 Found ${result.length} records.`;
                break;
            default:
                response = `❌ Update/Delete not implemented yet.`;
        }
        delete sessionStore[sessionId];
    } else {
        response = `Okay, let's restart. What organization are you inquiring about? Options: ${defaults.organizations.join(', ')}`;
        sessionStore[sessionId] = {
            organization: null,
            resourceType: null,
            action: null,
            queryfields: {},
            status: 'init',
        };
    }

    // Update session context with latest user input
    if (!ctx.organization && defaults.organizations.includes(userInput)) ctx.organization = userInput;
    else if (!ctx.resourceType && defaults.resourceTypes.includes(userInput)) ctx.resourceType = userInput;
    else if (!ctx.action && ['create', 'get', 'update', 'delete'].includes(userInput.toLowerCase())) ctx.action = userInput.toLowerCase();
    else if (ctx.action) {
        const requiredFields = defaults.requiredFields || [];
        const pending = requiredFields.find(f => !(f in ctx.queryfields));
        if (pending) ctx.queryfields[pending] = userInput;
    }

    // Refine response using Ollama AI
    const refined = await refinePromptWithOllama({ userInput, sessionId, context: ctx });

    res.json({ message: refined || response });
}
