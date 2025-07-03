import { resourceConfig, findBestMatch } from "../services/ollamaService.js";
import { findResourceByName, getOrganizations, getResourcesByType, getResourceTypes } from "../services/ResourceService.js";


export function removeNullKeys(obj) {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, value]) => !(value == null || value == 'undefined'))
    );
}


// Detect CRUD action from prompt
export const detectAction = (prompt) => {
    const actions = ['create', 'get', 'update', 'delete'];
    const lowerPrompt = prompt.toLowerCase();
    return actions.find(action => lowerPrompt.includes(action));
};

// Calculate confidence score (1-5)
export const calculateConfidence = (result, context) => {
    let score = 5; // Start with max confidence

    // Penalize for missing context
    if (!context.organization) score -= 1;
    if (!context.resourceName) score -= 1;

    // Penalize for incomplete data
    if (result.method === 'create') {
        const requiredFields = resourceConfig.fields.filter(f => f.required);
        const missing = requiredFields.filter(f =>
            !result.data.values?.some(v => v.fieldName === f.fieldName)
        );
        score -= missing.length * 0.5;
    }

    return Math.max(1, Math.min(5, Math.round(score)));
};

// Generate field-specific prompts
export const generateFieldPrompt = (fieldName) => {
    const field = resourceConfig.fields.find(f => f.fieldName === fieldName);

    console.log('genFFF', field, fieldName)
    if (!field) return `Please provide a value for ${fieldName}`;

    return `${field.name} (${field.fieldName}) is required. ` +
        `${field.description ? field.description + '.' : ''} ` +
        `Please provide: ${field.fieldName}`;
};

// Generate session IDs
export const generateSessionId = () => {
    return 'sess_' + Math.random().toString(36).substring(2, 15);
};





export async function extractOrganization(prompt, session) {
    const orgs = await getOrganizations();

    const { match, message, suggestions } = await findBestMatch(orgs, prompt, session);
    console.log(match, message, suggestions, session, 'extract org', orgs, prompt, session)
    return {
        value: match,
        feedback: message || (match
            ? `Got it, we'll work with ${match}.`
            : "I couldn't find that organization."),
        suggestions
    };
}

export async function extractResourceName(prompt, resources) {


    console.log(resources, 'RES')
    const { match, confidence } = await findBestMatch(resources, prompt);
    return {
        value: match,
        feedback: (match
            ? `Perfect, let's use ${match}.`
            : "That resource doesn't seem to exist."),
        confidence
    };
}

export const validateRequiredFields = (method, data, fieldsConfig) => {
    const missingFields = [];
    const followUpQuestions = [];
    let confirm = false;
    if (method === 'create') {
        fieldsConfig.forEach(field => {
            if (field.required) {
                const exists = data.values?.some(v => v.fieldName === field.fieldName);
                if (!exists) {
                    missingFields.push(field.fieldName);
                    followUpQuestions.push(
                        `${field.name} (${field.fieldName}) is required. ` +
                        `${field.description ? field.description + '.' : ''} ` +
                        `Please provide value for: ${field.fieldName}`
                    );
                }
            }
        });


        if (data?.type === 'config' && data.fields) {
            confirm = true;
            followUpQuestions.push(`Do you want to continue creating config setup?`);
        }

        if (method == 'find') {
            followUpQuestions.push(`Can you further describe what you lookin for?`);
        }



    }



    return { missingFields, followUpQuestions, confirm };
};

export function generateOperationSummary({ method, data, query }) {
    switch (method) {
        case 'create':
            return `Create new ${data.type} '${data.name}' with ${data.values.length} fields`;
        case 'get':
            return `Find ${data.type} resources matching ${Object.keys(query.filter).length} criteria`;
        case 'update':
            return `Update ${Object.keys(query.update).length} fields on ${data.type} resources`;
        case 'delete':
            return `Delete ${data.type} resources matching ${Object.keys(query.filter).length} conditions`;
        default:
            return `Perform ${method} operation`;
    }
}

export function determineConfirm(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('yes') || lowerPrompt.includes('ok') || lowerPrompt.includes('proceed') || lowerPrompt.includes('correct') || lowerPrompt.includes('save') || lowerPrompt.includes('go')) return true;
    return false;
}

/**
 * Converts objects/arrays to compact AI-readable strings
 * @param {any} input - The value to convert
 * @param {number} maxDepth - Maximum nesting level (default: 2)
 * @param {number} currentDepth - Current nesting level (internal use)
 * @param {WeakSet} [seen] - Track circular references (internal use)
 * @param {number} maxItems - Max items to show in arrays/objects (default: 5)
 * @returns {string} AI-readable string representation
 */
export function objectToAIString(data) {
    if (Array.isArray(data)) {
        return `[${data.map(item => objectToAIString(item)).join(', ')}]`;
    } else if (typeof data === 'object' && data !== null) {
        const entries = Object.entries(data).map(([key, value]) =>
            `${key}: ${objectToAIString(value)}`
        );
        return `{${entries.join(', ')}}`;
    } else if (typeof data === 'string') {
        return `"${data}"`;
    } else {
        return String(data);
    }
}


export function generateId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

// // Example usage:
// const complexObj = {
//     name: "John",
//     age: 30,
//     active: true,
//     address: {
//         street: "123 Main St",
//         city: "New York",
//         coordinates: [40.7128, -74.0060]
//     },
//     tags: ["user", "premium", null],
//     metadata: {
//         created: new Date(),
//         updated: null
//     }
// };

// console.log(objectToAIString(complexObj));