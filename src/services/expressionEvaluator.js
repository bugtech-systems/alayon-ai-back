// --------------------------------------
// Expression Evaluator with Helpers and Array Mapping
// --------------------------------------

import { generateAlphaNumeric, sanitizePhoneNumber } from "../utils/helpers.js";

// Safe getter function
function get(obj, path, defaultValue = null) {
    if (!obj || !path) return defaultValue;
    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
        if (current === null || current === undefined) return defaultValue;
        current = current[part];
    }

    return current !== undefined ? current : defaultValue;
}

// Core expression evaluator (async)
async function evaluateExpression(expr, context, helpers = {}) {
    try {
        const scope = { ...context, ...helpers };

        // Wrap dot notation in get()
        const processedExpr = expr.replace(
            /item\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g,
            (_, path) => `get(item, "${path}")`
        );

        const asyncEvaluator = new Function(
            ...Object.keys(scope),
            `"use strict"; return (async () => { return ${processedExpr}; })();`
        );

        return await asyncEvaluator(...Object.values(scope));
    } catch (err) {
        console.error(`Expression evaluation error: "${expr}"`, err.message, `evaluate expression. ${context}`);
        return null;
    }
}

// Default helper functions
const defaultFunctions = {
    // string helpers
    toUpper: str => String(str).toUpperCase(),
    toLower: str => String(str).toLowerCase(),
    capitalize: str => String(str).charAt(0).toUpperCase() + String(str).slice(1),
    string: str => `"${String(str)}"`,
    number: str => `${Number(str)}`,
    jsonStringify: str => `${JSON.stringify(str, null, 2)}`,
    hasValue: str =>  str !== null && str !== undefined && str !== "",



    // date helpers
    dateFormat: date => new Date(date).toLocaleDateString(),
    dateNow: () => new Date().toISOString().split("T")[0],

    // number helpers
    formatCurrency: num =>
        Number(num).toLocaleString("en-US", { style: "currency", currency: "USD" }),
    formatPhoneNumber: num => sanitizePhoneNumber(num),

    // Generators
    generateTransactionId: () => generateAlphaNumeric(),


    // array/object helpers
    filterBy: (arr, key, value) =>
        Array.isArray(arr) ? arr.filter(item => item?.[key] === value) : [],
    sumBy: (arr, key) =>
        Array.isArray(arr)
            ? arr.reduce((sum, item) => sum + (Number(item?.[key]) || 0), 0)
            : 0,
    count: arr => (Array.isArray(arr) ? arr.length : 0),
    mapBy: (arr, key) => (Array.isArray(arr) ? arr.map(item => item?.[key]) : []),


    // ✅ Merge two objects deeply
    mergeObjects: (obj1 = {}, obj2 = {}) => {
        if (typeof obj1 !== "object" || obj1 === null) return obj2;
        if (typeof obj2 !== "object" || obj2 === null) return obj1;

        const result = { ...obj1 };
        for (const key of Object.keys(obj2)) {
            if (
                obj1[key] &&
                typeof obj1[key] === "object" &&
                !Array.isArray(obj1[key]) &&
                typeof obj2[key] === "object" &&
                !Array.isArray(obj2[key])
            ) {
                result[key] = defaultFunctions.mergeObjects(obj1[key], obj2[key]);
            } else {
                result[key] = obj2[key];
            }
        }
        return result;
    },

    // Array mapping function - placeholder friendly
    mapArray: async (array, fieldMappings, context = {}, helpers = {}) => {
        if (!Array.isArray(array)) return [];

        const allHelpers = { ...defaultFunctions, ...helpers };

        return Promise.all(
            array.map(async (item, index) => {
                const itemContext = { ...context, item, index, array, ...allHelpers };
                const mapped = {};

                for (const [fieldName, fieldExpression] of Object.entries(fieldMappings)) {
                    if (typeof fieldExpression === "string") {
                        mapped[fieldName] = await evaluateExpression(
                            fieldExpression,
                            itemContext,
                            allHelpers
                        );
                    } else if (typeof fieldExpression === "function") {
                        mapped[fieldName] = await fieldExpression(
                            item,
                            index,
                            array,
                            itemContext
                        );
                    } else if (
                        typeof fieldExpression === "object" &&
                        fieldExpression !== null
                    ) {
                        mapped[fieldName] = await defaultFunctions
                            .mapArray([item], fieldExpression, itemContext, allHelpers)
                            .then(r => r[0]);
                    } else {
                        mapped[fieldName] = fieldExpression;
                    }
                }

                return mapped;
            })
        );
    },
    
mapObject: async (obj, fieldMappings, context = {}, helpers = {}) => {
    if (!obj || typeof obj !== "object") return {};

    const allHelpers = { ...defaultFunctions, ...helpers };
    const itemContext = { ...context, obj, ...allHelpers };
    let mapped = {};

    for (const [fieldName, fieldExpression] of Object.entries(fieldMappings)) {
        // Special case: spread fields from a nested object
        if (fieldName === "*") {
            let spreadSource = {};

            if (typeof fieldExpression === "string") {
                spreadSource = await evaluateExpression(
                    fieldExpression,
                    itemContext,
                    allHelpers
                );
            } else if (typeof fieldExpression === "function") {
                spreadSource = await fieldExpression(obj, itemContext);
            } else if (typeof fieldExpression === "object" && fieldExpression !== null) {
                spreadSource = await defaultFunctions.mapObject(
                    obj,
                    fieldExpression,
                    itemContext,
                    allHelpers
                );
            } else {
                spreadSource = fieldExpression;
            }

            if (spreadSource && typeof spreadSource === "object") {
                mapped = { ...mapped, ...spreadSource };
            }
        }
        // Normal mapping
        else if (typeof fieldExpression === "string") {
            mapped[fieldName] = await evaluateExpression(
                fieldExpression,
                itemContext,
                allHelpers
            );
        } else if (typeof fieldExpression === "function") {
            mapped[fieldName] = await fieldExpression(obj, itemContext);
        } else if (typeof fieldExpression === "object" && fieldExpression !== null) {
            mapped[fieldName] = await defaultFunctions.mapObject(
                obj,
                fieldExpression,
                itemContext,
                allHelpers
            );
        } else {
            mapped[fieldName] = fieldExpression;
        }
    }

    return mapped;
},


    // Nested field access helper
    get,

    arrayParamsObject: arr => {
        const params = {};
        const defaults = {};
        const fieldOptions = arr.map(a => {
            params[a.field_name] = `<${a.data_type}>`;
            defaults[a.field_name] = `${a.default_value}`;
            return { [a.field_name]: a.options };
        });

        return { params, defaults, options: fieldOptions };
    }
};

/**
 * Async placeholder resolver with all default functions
 */
export async function resolvePlaceholders(input, context = {}, helpers = {}) {
    const allFunctions = { ...defaultFunctions, ...helpers };
    const sandbox = { ...context, ...allFunctions };

    const evalExpression = async expr => {
        try {
            const fn = new Function(
                ...Object.keys(sandbox),
                `"use strict"; return (async () => (${expr}))();`
            );
            return await fn(...Object.values(sandbox));
        } catch (e) {
        console.log('EXPRESSION ERROR', expr)
            // console.error(`Expression evaluation error: "${expr}"`, e.message, `resolve place holder. INPUT --- ${input} OUTPUT ---- CONTEXT ${JSON.stringify(context)} |||`);
            return null;
        }
    };

    const resolve = async value => {
        if (typeof value === "string") {
            const regex = /\{\{(.*?)\}\}/g;
            let result = value;
            const matches = [...value.matchAll(regex)];

            for (const match of matches) {
                const expr = match[1].trim();
                const evaluated = await evalExpression(expr);
                result = result.replace(
                    match[0],
                    typeof evaluated === "object"
                        ? JSON.stringify(evaluated)
                        : evaluated ?? ""
                );
            }

            try {
                return JSON.parse(result);
            } catch {
                return result;
            }
        }

        if (Array.isArray(value)) {
            return Promise.all(value.map(v => resolve(v)));
        }

        if (value && typeof value === "object") {
            const entries = await Promise.all(
                Object.entries(value).map(async ([k, v]) => [k, await resolve(v)])
            );
            return Object.fromEntries(entries);
        }

        return value;
    };

    return resolve(input);
}

/**
 * Synchronous placeholder evaluation with all default functions
 */
export function evaluatePlaceholders(input, context = {}, extraFunctions = {}) {
    const allFunctions = { ...defaultFunctions, ...extraFunctions };
    const sandbox = { ...context, ...allFunctions };

    const evalExpression = expr => {
        try {
            const fn = new Function(
                ...Object.keys(sandbox),
                `"use strict"; return (${expr});`
            );
            return fn(...Object.values(sandbox));
        } catch (e) {
            console.error(`Expression evaluation error: "${expr}"`, e.message, `evaluate place holder. ${input}`);
            return null;
        }
    };

    const resolve = value => {
        if (typeof value === "string") {
            const replaced = value.replace(/\{\{(.*?)\}\}/g, (_, expr) => {
                const result = evalExpression(expr.trim());
                if (typeof result === "object") {
                    return JSON.stringify(result);
                }
                return result ?? "";
            });

            try {
                return JSON.parse(replaced);
            } catch {
                return replaced;
            }
        }
        if (Array.isArray(value)) {
            return value.map(v => resolve(v));
        }
        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.entries(value).map(([k, v]) => [k, resolve(v)])
            );
        }
        return value;
    };

    return resolve(input);
}



/**
 * Safely get nested property value from an object using dot/bracket notation.
 * @param {object} obj - The object to extract value from.
 * @param {string} path - Dot/bracket notation path, e.g. "user.profile.age" or "items[0].name".
 * @param {*} defaultValue - Value returned if path is invalid or undefined.
 */
function getNestedValue(obj, path, defaultValue = undefined) {
console.log(obj, path, defaultValue = undefined, 'nested', !obj || typeof path !== "string")
  if (!obj || typeof path !== "string") return defaultValue;

  return path
    .replace(/\[(\w+)\]/g, ".$1") // convert [0] → .0
    .split(".")
    .reduce((acc, key) => {
      if (acc && Object.prototype.hasOwnProperty.call(acc, key)) {
        return acc[key];
      }
      return defaultValue;
    }, obj);
}

// Export individual functions
export { get, defaultFunctions, evaluateExpression, getNestedValue };
