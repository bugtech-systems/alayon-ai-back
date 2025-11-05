// Deep object property access using dot notation
function getFromPath(obj, path) {
    return path.split('.').reduce((o, p) => o?.[p], obj);
}

// Check if a value contains template variables
function hasTemplates(value) {
    return typeof value === 'string' && /\{\{.+?\}\}/.test(value);
}

// Main parameter resolver
export function resolveParameters(templateParams, executionContext) {
    const result = {};

    for (const [key, value] of Object.entries(templateParams)) {
        result[key] = resolveValue(value, executionContext);
    }

    return result;
}

function resolveValue(value, context) {
    // Handle primitive values
    if (value === null || typeof value !== 'object') {
        return resolveStringTemplates(value, context);
    }

    // Handle arrays
    if (Array.isArray(value)) {
        return value.map(item => resolveValue(item, context));
    }

    // Handle objects
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, resolveValue(v, context)])
        );
    }

    return value;
}

function resolveStringTemplates(value, context) {
    if (typeof value !== 'string') return value;

    return value.replace(/\{\{(.+?)\}\}/g, (_, expression) => {
        try {
            // Try direct path resolution first
            const pathResult = getFromPath(context, expression.trim());
            if (pathResult !== undefined) return pathResult;

            // Fallback to expression evaluation
            return evaluateExpression(expression, context);
        } catch (error) {
            console.error(`Template resolution failed for "${expression}":`, error);
            return '';
        }
    });
}

function evaluateExpression(expr, context) {
    // Safe evaluation with limited context
    const sandbox = {
        ...context,
        // Helper functions
        math: Math,
        date: {
            now: () => new Date(),
            format: (d, f) => dayjs(d).format(f)
        },
        // Array/object helpers
        map: (arr, fn) => arr.map(fn),
        filter: (arr, fn) => arr.filter(fn),
        find: (arr, fn) => arr.find(fn)
    };

    // Restrict access to only our sandbox
    const evaluator = new Function('ctx', `with(ctx) { return ${expr} }`);
    return evaluator(sandbox);
}


// export function resolveConfig(template, parameters) {
//     const resolved = JSON.parse(JSON.stringify(template)); // Deep clone
//     _resolveObject(resolved, parameters);
//     return resolved;
// }

// Recursively process objects/arrays
function _resolveObject(obj, parameters) {
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            _resolveObject(obj[key], parameters); // Recurse
        } else if (typeof obj[key] === 'string') {
            obj[key] = _resolvePlaceholder(obj[key], parameters);
        }
    }
}

// Replace {{params.x}} or {{outputs.x}} with actual values
function _resolvePlaceholder(str, parameters) {
    const regex = /\{\{(params|outputs)\.([^}]+)\}\}/g;
    return str.replace(regex, (match, type, path) => {
        const value = _getNestedValue(parameters, path);
        return value !== undefined ? value : match; // Preserve placeholder if missing
    });
}

// Safely get nested values (e.g., "user.email" => parameters.user?.email)
function _getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
}


/**
 * Resolves all placeholders in a configuration object
 * @param {*} config - Configuration object to process
 * @param {Object} context - Context object for reference values
 * @returns {*} Resolved configuration
 */
export const resolveConfig = (config, context = {}) => {
    // Handle primitive values
    if (typeof config !== 'object' || config === null) {
        return typeof config === 'string' ? resolveStringPlaceholders(config, context) : config;
    }

    // Process arrays
    if (Array.isArray(config)) {
        return config.map(item => resolveConfig(item, context));
    }

    // Process objects
    const result = {};
    for (const [key, value] of Object.entries(config)) {
        result[key] = resolveConfig(value, context);
    }
    return result;
};

export function resolveEmptyConfig(config, params) {
    // Create a deep copy of the original config to avoid modifying it directly
    const resolvedConfig = JSON.parse(JSON.stringify(config));

    // Iterate over each property in params
    for (const key in params) {
        // Check if the key exists in config and if the config value is "empty"
        if (resolvedConfig.hasOwnProperty(key)) {
            if (
                resolvedConfig[key] === '' ||
                (Array.isArray(resolvedConfig[key]) && resolvedConfig[key].length === 0) ||
                resolvedConfig[key] === null ||
                resolvedConfig[key] === undefined
            ) {
                // Replace empty config value with params value
                resolvedConfig[key] = params[key];
            }
        } else {
            // If the key doesn't exist in config, add it
            resolvedConfig[key] = params[key];
        }
    }

    return resolvedConfig;
}

/**
 * Resolves all placeholders in a string
 * @param {string} str - String containing placeholders
 * @param {Object} context - Context object
 * @returns {*} Resolved value (may change type if single placeholder)
 */
export function resolveStringPlaceholders(str, context) {
    const placeholderRegex = /\{\{(.+?)\}\}/g;
    const placeholders = [...str.matchAll(placeholderRegex)];

    // No placeholders - return as-is
    if (placeholders.length === 0) return str;

    // Single placeholder that covers entire string - return raw value
    if (placeholders.length === 1 && placeholders[0][0] === str) {
        return resolvePlaceholder(placeholders[0][1], context);
    }

    // Multiple placeholders - replace each one
    let result = str;
    for (const match of placeholders) {
        const [fullMatch, expr] = match;
        const value = resolvePlaceholder(expr, context);
        result = result.replace(fullMatch, String(value));
    }

    return result;
}

/**
 * Resolves a single placeholder expression
 * @param {string} expr - Placeholder expression
 * @param {Object} context - Context object
 * @returns {*} Resolved value
 */
function resolvePlaceholder(expr, context) {
    // Handle array map operations: {{array|map('field')}}
    const mapMatch = expr.match(/^(.+?)\|map\('(.+?)'\)$/);
    if (mapMatch) {
        const [_, arrayPath, fieldName] = mapMatch;
        const array = resolvePath(arrayPath, context);

        if (!Array.isArray(array)) {
            console.warn(`Expected array for mapping at path: ${arrayPath}`);
            return [];
        }

        return array.map(item => {
            if (typeof item === 'object' && item !== null) {
                return item[fieldName];
            }
            return undefined;
        }).filter(val => val !== undefined);
    }

    // Handle regular path resolution
    return resolvePath(expr, context);
}

/**
 * Resolves a path from context
 * @param {string} path - Path to resolve (dot notation)
 * @param {Object} context - Context object
 * @returns {*} Resolved value
 */
function resolvePath(path, context) {
    // Handle root-level references
    if (path in context) {
        return context[path];
    }

    // Handle nested path resolution
    const parts = path.split('.');
    let current = context;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }

        // Handle array indices (e.g., "items[0]")
        const arrayIndexMatch = part.match(/^(.+?)\[(\d+)\]$/);
        if (arrayIndexMatch) {
            const [_, arrayName, indexStr] = arrayIndexMatch;
            const array = current[arrayName];
            const index = parseInt(indexStr, 10);

            if (!Array.isArray(array) || index >= array.length) {
                return undefined;
            }
            current = array[index];
        } else {
            current = current[part];
        }
    }

    return current;
}


/**
 * Absolute guaranteed object formatter
 */
function formatObject(value) {
    if (value === null) return 'null';
    if (value === undefined) return '';

    // Handle primitive types
    if (typeof value !== 'object') return String(value);

    // Handle arrays
    if (Array.isArray(value)) {
        return `[${value.map(formatObject).join(', ')}]`;
    }

    // Handle Date objects
    if (value instanceof Date) return value.toISOString();

    // Handle all other objects
    try {
        const entries = Object.entries(value);
        if (entries.length === 0) return '{}';

        return `{ ${entries.map(([k, v]) => `${k}: ${formatObject(v)}`).join(', ')} }`;
    } catch {
        return 'Object';
    }
}

/**
 * Nuclear-proof placeholder resolver
 */
export function resolvePlaceholders(str, context) {
    if (typeof str !== 'string') return str;

    // Handle single placeholder case
    const singleMatch = str.match(/^{{\s*([^{}\s]+)\s*}}$/);
    if (singleMatch) {
        const value = getNestedValue(context, singleMatch[1].trim());
        return value !== undefined ? value : str;
    }

    // Handle template strings
    return str.replace(/{{([^{}]+)}}/g, (match, path) => {
        const value = getNestedValue(context, path.trim());
        return value !== undefined ? formatObject(value) : match;
    });
}

/**
 * Deeply gets nested values
 */
export function getNestedValue(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;

    return path.split('.').reduce((acc, part) => {
        if (acc === null || acc === undefined) return undefined;
        return acc[part];
    }, obj);
}