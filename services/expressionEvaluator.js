// Custom function registry for field mapping expressions
const FUNCTION_REGISTRY = {
    // String functions
    concat: (...args) => args.join(''),
    uppercase: (str) => str?.toUpperCase(),
    lowercase: (str) => str?.toLowerCase(),

    // Math functions
    add: (a, b) => Number(a) + Number(b),
    subtract: (a, b) => Number(a) - Number(b),
    multiply: (a, b) => Number(a) * Number(b),
    divide: (a, b) => Number(a) / Number(b),

    // Comparison functions
    eq: (a, b) => a === b,
    neq: (a, b) => a !== b,
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,

    // Logical functions
    and: (...args) => args.every(Boolean),
    or: (...args) => args.some(Boolean),
    not: (a) => !a,

    // Conditional function
    if: (condition, trueVal, falseVal) => condition ? trueVal : falseVal,

    // Date functions
    now: () => new Date().toISOString(),
    dateAdd: (date, amount, unit) => {
        const d = new Date(date);
        const units = { days: 864e5, hours: 36e5, minutes: 6e4, seconds: 1e3 };
        d.setTime(d.getTime() + (amount * (units[unit] || 0)));
        return d.toISOString();
    }
};

/**
 * Resolves field mappings using a custom expression language
 * @param {object} config - Configuration object with expressions
 * @param {object} context - Execution context with params and outputs
 * @returns {object} Resolved configuration
 */
/**
 * Resolves field mappings with support for array field extraction
 * @param {*} config - Configuration object to process
 * @param {Object} context - Context object for reference values
 * @returns {*} Resolved configuration
 */
export const resolveFieldMappings = (config, context) => {
    // Handle primitive values directly
    if (typeof config !== 'object' || config === null) return config;

    // Handle string values with placeholders
    if (typeof config === 'string') {
        return resolvePlaceholders(config, context);
    }

    // Process arrays
    if (Array.isArray(config)) {
        return config.map(item => resolveFieldMappings(item, context));
    }

    // Process objects
    const resolved = {};
    for (const [key, value] of Object.entries(config)) {
        resolved[key] = resolveFieldMappings(value, context);
    }
    return resolved;
};

/**
 * Resolves special placeholder syntax in strings
 * @param {string} str - String containing placeholders
 * @param {Object} context - Context object
 * @returns {*} Resolved value
 */
function resolvePlaceholders(str, context) {
    const placeholderRegex = /\{\{(.+?)\}\}/g;
    let result = str;
    let match;

    while ((match = placeholderRegex.exec(str)) !== null) {
        const [fullMatch, inner] = match;
        const resolvedValue = resolvePlaceholder(inner, context);
        result = result.replace(fullMatch, resolvedValue);
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
        const array = resolveValue(arrayPath, context);

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

    // Handle regular value resolution
    return resolveValue(expr, context);
}

/**
 * Resolves a value path from context
 * @param {string} path - Path to resolve
 * @param {Object} context - Context object
 * @returns {*} Resolved value
 */
function resolveValue(path, context) {
    // Handle direct value references
    if (path in context) {
        return context[path];
    }

    // Handle nested path resolution (e.g., "parent.child")
    const parts = path.split('.');
    let current = context;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        current = current[part];
    }

    return current;
}
/**
 * Evaluates an expression string using context data
 * @param {string} expr - Expression string
 * @param {object} context - Execution context
 * @returns {any} Evaluated result
 */
const evaluateExpression = (expr, context) => {
    // Handle simple variable references: {{path.to.value}}
    const variablePattern = /^{{\s*([\w.]+)\s*}}$/;
    const variableMatch = expr.match(variablePattern);
    if (variableMatch) {
        return getNestedValue(context, variableMatch[1]);
    }

    // Handle function calls: {{func(arg1, "arg2", arg3)}}
    const functionPattern = /^{{\s*(\w+)\(([^)]*)\)\s*}}$/;
    const functionMatch = expr.match(functionPattern);
    if (functionMatch) {
        const [, funcName, argsStr] = functionMatch;
        const args = parseArguments(argsStr).map(arg =>
            resolveValue(arg.trim(), context)
        );

        if (!FUNCTION_REGISTRY[funcName]) {
            throw new Error(`Undefined function: ${funcName}`);
        }

        return FUNCTION_REGISTRY[funcName](...args);
    }

    // Handle complex templates: "Hello {{user.name}}!"
    return expr.replace(/{{([^{}]+)}}/g, (_, path) => {
        const value = getNestedValue(context, path.trim());
        return value !== undefined ? value : '';
    });
};

/**
 * Gets nested value from object using dot notation path
 * @param {object} obj - Source object
 * @param {string} path - Dot notation path
 * @returns {any} Value at path or undefined
 */
const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => {
        if (acc === null || acc === undefined) return undefined;
        return acc[part];
    }, obj);
};

/**
 * Parses function arguments from a string
 * @param {string} argsStr - Arguments string
 * @returns {string[]} Array of argument strings
 */
const parseArguments = (argsStr) => {
    const args = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let depth = 0;

    for (const char of argsStr) {
        if (char === '"' || char === "'") {
            if (!inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar) {
                inQuotes = false;
            }
        }

        if (!inQuotes) {
            if (char === '(') depth++;
            if (char === ')') depth--;
            if (char === ',' && depth === 0) {
                args.push(current);
                current = '';
                continue;
            }
        }

        current += char;
    }

    if (current) args.push(current);
    return args;
};

export default {
    resolveFieldMappings,
    evaluateExpression
};