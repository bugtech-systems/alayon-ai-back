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
    return {
        value: match,
        feedback: message || (match
            ? `Got it, we'll work with ${match}.`
            : "I couldn't find that organization."),
        suggestions
    };
}

export async function extractResourceName(prompt, resources) {


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

// Unique ID generator for executions
export const generateExecutionId = () =>
    `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function incrementVersion(version) {
    // Split the version into parts
    let [major, minor, patch] = version.split('.').map(Number);

    // Increment patch
    patch += 1;

    // Check if patch exceeds 9
    if (patch > 9) {
        patch = 0;
        minor += 1;
    }

    // Check if minor exceeds 9
    if (minor > 9) {
        minor = 0;
        major += 1;
    }

    // Reconstruct the version string
    return `${major}.${minor}.${patch}`;
}

export function generateFromSchema(schema) {
    if (!schema || typeof schema !== 'object') {
        throw new Error('Invalid schema: must be an object');
    }

    // Handle different schema types
    switch (schema.type) {
        case 'object':
            return generateObject(schema);
        case 'array':
            return generateArray(schema);
        case 'string':
        case 'number':
        case 'boolean':
        case 'integer':
            return generatePrimitive(schema);
        default:
            return null;
    }
}

function generateObject(schema) {
    const obj = {};

    if (!schema.properties) {
        return obj;
    }

    for (const [key, propSchema] of Object.entries(schema.properties)) {
        // Handle required fields or nullable fields
        const isRequired = schema.required?.includes(key) ?? false;
        const isNullable = Array.isArray(propSchema.type) && propSchema.type.includes('null');

        // Skip if field is not required and not explicitly nullable
        if (!isRequired && !isNullable) {
            continue;
        }

        // Generate value based on priority: enum > default > example > null
        if (propSchema.enum && propSchema.enum.length > 0) {
            obj[key] = propSchema.enum[0]; // Take first enum value
        } else if ('default' in propSchema) {
            obj[key] = propSchema.default;
        } else if ('example' in propSchema) {
            obj[key] = propSchema.example;
        } else {
            obj[key] = generateFromSchema(propSchema) ?? null;
        }
    }

    return obj;
}

function generateArray(schema) {
    if (!schema.items) {
        return [];
    }

    // Generate 1-2 example items
    const itemCount = Math.min(2, schema.minItems ?? 1);
    return Array.from({ length: itemCount }, () => generateFromSchema(schema.items));
}

function generatePrimitive(schema) {
    if (schema.enum && schema.enum.length > 0) {
        return schema.enum[0]; // Take first enum value
    }

    if ('default' in schema) {
        return schema.default;
    }

    if ('example' in schema) {
        return schema.example;
    }

    // Fallback to type-appropriate defaults
    switch (schema.type) {
        case 'string': return '';
        case 'number': return 0;
        case 'integer': return 0;
        case 'boolean': return false;
        default: return null;
    }
}



export function cleanAndParseJSON(input) {
    try {
        // Replace backticks with double quotes
        let cleaned = input.replace(/`/g, '"');

        // Replace single-quoted keys and values with double quotes
        cleaned = cleaned.replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":'); // keys
        cleaned = cleaned.replace(/:\s*'([^']*?)'(?=[},])/g, ': "$1"');   // values

        // Remove trailing commas
        cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

        // Trim whitespace
        cleaned = cleaned.trim();

        console.log("Raw input:\n", input);
        console.log("Cleaned input:\n", cleaned);

        return JSON.parse(cleaned);
    } catch (err) {
        console.error("Failed to clean or parse JSON:", err);
        throw err;
    }
}



export function isJsonParsable(str) {
    try {
        JSON.parse(str);
        return true;
    } catch (e) {
        return false;
    }
}



export const formatResourceResponse = (resource, connection) => {
    if (!resource) return null;

    // Format relationships into grouped object
    const formattedRelationships = {};
    if (connection && resource.incoming_relationships) {
        let relate = 'incoming_relationships';
        resource[relate].forEach(relationship => {
            const relatedResource = relationship.target_resource || relationship.source_resource;
            if (relatedResource && (String(relatedResource.resource_name).toLowerCase() == String(connection).toLowerCase())) {
                if (!formattedRelationships[relatedResource.resource_name]) {
                    formattedRelationships[relatedResource.resource_name] = [];
                }

                formattedRelationships[relatedResource.resource_name].push({
                    id: relatedResource.id,
                    resource_type: 'resource',
                    resource_name: relatedResource.resource_name,
                    attributes: { ...relatedResource.attributes },
                    is_deleted: relatedResource.is_deleted,
                    is_active: relatedResource.is_active,
                    created_at: relatedResource.created_at,
                    updated_at: relatedResource.updated_at,
                    // Include relationship-specific attributes if needed
                    relationship_attributes: {
                        created_at: relationship.created_at,
                        updated_at: relationship.updated_at,
                        ...relationship.attributes
                    }
                });
            }
        });
    }

    if (connection && resource.outgoing_relationships) {
        let relate = 'outgoing_relationships';
        resource[relate].forEach(relationship => {
            const relatedResource = relationship.target_resource || relationship.source_resource;
            if (relatedResource && (String(relatedResource.resource_name).toLowerCase() == String(connection).toLowerCase())) {
                if (!formattedRelationships[relatedResource.resource_name]) {
                    formattedRelationships[relatedResource.resource_name] = [];
                }

                formattedRelationships[relatedResource.resource_name].push({
                    id: relatedResource.id,
                    resource_type: 'resource',
                    resource_name: relatedResource.resource_name,
                    attributes: { ...relatedResource.attributes },
                    is_deleted: relatedResource.is_deleted,
                    is_active: relatedResource.is_active,
                    created_at: relatedResource.created_at,
                    updated_at: relatedResource.updated_at,
                    // Include relationship-specific attributes if needed
                    relationship_attributes: {
                        created_at: relationship.created_at,
                        updated_at: relationship.updated_at
                    }
                });
            }
        });
    }

    return {
        id: resource.id,
        resource_type: 'resource',
        resource_name: resource.resource_name,
        tenant_id: resource.tenant_id,
        attributes: {
            ...resource.attributes,
        },
        relationships: connection ? formattedRelationships : {},
        meta: {
            is_deleted: resource.is_deleted,
            is_active: resource.is_active,
            created_at: resource.created_at,
            updated_at: resource.updated_at
        }
    };
};


/**
 * Generates a parameters object from a schema definition
 * @param {Array} parametersSchema - Schema definition array
 * @param {Object} inputValues - Key-value pairs from input sources
 * @returns {Object} - { parameters: {}, errors: {} }
 */
export function generateFieldTypeMap(parametersSchema) {
    const fieldTypeMap = {};

    // Validate input
    if (!Array.isArray(parametersSchema)) {
        throw new Error('Input must be an array of parameter definitions');
    }

    // Process each parameter in the schema
    parametersSchema.forEach(param => {
        // Validate parameter structure
        if (!param.field_name || !param.data_type) {
            throw new Error('Each parameter must have field_name and data_type properties');
        }

        // Map field name to data type
        fieldTypeMap[param.field_name] = param.data_type;
    });

    return fieldTypeMap;
}



export function splitMessageWithPagination(message, chunkSize = 500) {
    if (!message || message.length === 0) return [];

    const chunks = [];
    const totalPages = Math.ceil(message.length / chunkSize);

    for (let i = 0; i < totalPages; i++) {
        const start = i * chunkSize;
        const end = start + chunkSize;
        let chunk = message.slice(start, end);

        // Add page indicator (except when the chunk is exactly at the end)
        if (totalPages > 1 && end < message.length) {
            chunk += ` (${i + 1}/${totalPages})`;
        } else if (totalPages > 1) {
            // Last chunk gets the indicator too
            chunk += ` (${i + 1}/${totalPages})`;
        }

        chunks.push(chunk);
    }

    return chunks;
}


/**
 * Evaluates a string with placeholders and replaces them with values from a params object.
 * @param {string} text - The input text containing placeholders like {{params.key}}
 * @param {object} params - The JSON object containing replacement values
 * @param {object} options - Configuration options
 * @param {boolean} [options.returnJSON=false] - Whether to parse the result as JSON
 * @param {boolean} [options.strict=false] - Throw errors for missing placeholders
 * @returns {string|object} The evaluated string or parsed JSON object
 */
export function evaluateStringExpression(text, params = {}, options = {}) {
    const { returnJSON = false, strict = false } = options;

    // Handle non-string input
    if (typeof text !== 'string') {
        if (returnJSON && typeof text === 'object') {
            return text; // Already parsed
        }
        throw new Error('Input text must be a string');
    }

    // Regular expression to match placeholders like {{params.key}} or {{params.key.subkey}}
    const placeholderRegex = /\{\{\s*([^}\s]+)\s*\}\}/g;

    const evaluated = text.replace(placeholderRegex, (match, path) => {
        try {
            // Split the path into parts (e.g., 'params.object.key' -> ['params', 'object', 'key'])
            const parts = path.split('.');

            // Start with the params object
            let value = { ...params };

            // Traverse the path to get the value
            for (const part of parts) {
                if (value === undefined || value === null) {
                    break;
                }
                value = value[part];
            }

            // If value is undefined and we're in strict mode, throw an error
            if (value === undefined && strict) {
                throw new Error(`Missing value for placeholder: ${match}`);
            }

            // Return the value or the original match if not found (non-strict mode)
            return value !== undefined ? value : match;
        } catch (error) {
            if (strict) {
                throw error;
            }
            return match; // Return the original placeholder if something goes wrong
        }
    });

    // If requested, try to parse the result as JSON
    if (returnJSON) {
        try {
            return JSON.parse(evaluated);
        } catch (error) {
            if (strict) {
                throw new Error('Result is not valid JSON');
            }
            return evaluated;
        }
    }

    return evaluated;
}

/**
 * Helper function to create templates with placeholders
 * @param {string} text - The template text with placeholders
 * @returns {function} A function that takes params and options and returns the evaluated result
 */
export function createTemplate(text) {
    return (params = {}, options = {}) => evaluateExpression(text, params, options);
}


/**
 * Replaces placeholders in text with stringified JSON values
 * @param {string} text - Input text with placeholders
 * @param {object} params - Parameters containing replacement values
 * @param {object} options - Configuration options
 * @param {boolean} [options.pretty=false] - Pretty-print JSON strings
 * @param {boolean} [options.strict=false] - Throw errors for missing placeholders
 * @returns {string} Text with replaced values
 */
export function replacePlaceholdersWithStringify(text, params = {}, options = {}) {
    const { pretty = false, strict = false } = options;
    const placeholderRegex = /\{\{\s*([^}\s]+)\s*\}\}/g;

    return text.replace(placeholderRegex, (match, path) => {
        const value = getNestedValue(params, path.split('.'));

        if (value === undefined) {
            if (strict) {
                throw new Error(`Missing value for placeholder: ${match}`);
            }
            return match; // Return original placeholder if not found
        }

        // Stringify objects, leave primitives as-is
        if (typeof value === 'object' && value !== null) {
            return pretty
                ? JSON.stringify(value, null, 2)
                : JSON.stringify(value);
        }

        return value.toString();
    });
}

/**
 * Gets nested value from object using path array
 * @param {object} obj - Source object
 * @param {string[]} pathParts - Path segments
 * @returns {any} Found value or undefined
 */
function getNestedValue(obj, pathParts) {
    return pathParts.reduce((acc, part) => {
        if (acc === undefined || acc === null) return undefined;
        return acc[part];
    }, obj);
}