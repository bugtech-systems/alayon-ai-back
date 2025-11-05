// --------------------------------------
// Expression Evaluator with Helpers
// --------------------------------------

import { sanitizePhoneNumber } from "../helpers/helpers.js";

async function evaluateExpression(expr, context, helpers = {}) {
    try {
        const scope = { ...context, ...helpers };

        // Auto-convert "if ..." into ternary
        const ifPattern = /^if\s+(.+?),\s*(.+?),\s*(.+)$/i;
        if (ifPattern.test(expr.trim())) {
            expr = expr.trim().replace(ifPattern, '($1) ? ($2) : ($3)');
        }

        const asyncEvaluator = new Function(
            ...Object.keys(scope),
            `"use strict"; return (async () => { return ${expr}; })();`
        );

        return await asyncEvaluator(...Object.values(scope));
    } catch (err) {
        console.error(`Expression evaluation error: "${expr}"`, err);
        return null;
    }
}

export async function resolvePlaceholders(input, context, helpers = {}) {
    if (typeof input === 'string') {
        const regex = /{{\s*([^{}]+)\s*}}/g;
        let result = input;
        const matches = [...input.matchAll(regex)];

        for (const match of matches) {
            const expr = match[1];
            const value = await evaluateExpression(expr, context, helpers);

            result = result.replace(match[0], typeof value === 'object'
                ? JSON.stringify(value)
                : value ?? '');
        }
        return result;

    } else if (Array.isArray(input)) {
        return Promise.all(input.map(item => resolvePlaceholders(item, context, helpers)));

    } else if (typeof input === 'object' && input !== null) {
        const resolved = {};
        for (const key of Object.keys(input)) {
            resolved[key] = await resolvePlaceholders(input[key], context, helpers);
        }
        return resolved;
    }

    return input;
}

export function evaluatePlaceholders(input, context = {}, extraFunctions = {}) {
  const defaultFunctions = {
    // string helpers
    toUpper: str => String(str).toUpperCase(),
    toLower: str => String(str).toLowerCase(),
    capitalize: str => String(str).charAt(0).toUpperCase() + String(str).slice(1),
    string: str => `"${String(str)}"`,
    jsonStringify: str => `${JSON.stringify(str, null, 2)}`,
    hasValue: str => (str !== null && str !== undefined && String(str).trim()) ? true : false,

    // date helpers
    dateFormat: date => new Date(date).toLocaleDateString(),
    dateNow: () => new Date().toISOString().split('T')[0],

    // number helpers
    formatCurrency: num => Number(num).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    formatPhoneNumber: num => sanitizePhoneNumber(num),

    // array/object helpers
    filterBy: (arr, key, value) => Array.isArray(arr) ? arr.filter(item => item?.[key] === value) : [],
    sumBy: (arr, key) => Array.isArray(arr) ? arr.reduce((sum, item) => sum + (Number(item?.[key]) || 0), 0) : 0,
    count: arr => Array.isArray(arr) ? arr.length : 0,
    mapBy: (arr, key) => Array.isArray(arr) ? arr.map(item => item?.[key]) : [],
  };

  const sandbox = { ...context, ...defaultFunctions, ...extraFunctions };

  const evalExpression = expr => {
    try {
      const fn = new Function(...Object.keys(sandbox), `"use strict"; return (${expr});`);
      return fn(...Object.values(sandbox));
    } catch (e) {
      console.warn(`Expression evaluation error: "${expr}" — returning original expression.`);
      return expr; // ✅ Return the same expression instead of null
    }
  };

  const resolve = value => {
    if (typeof value === 'string') {
      const replaced = value.replace(/\{\{(.*?)\}\}/g, (_, expr) => {
        const result = evalExpression(expr.trim());
        if (typeof result === 'object') {
          try {
            return JSON.stringify(result);
          } catch {
            return String(result);
          }
        }
        return (result !== null && result !== undefined) ? result : expr; // ✅ fallback to same expression
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

    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
    }

    return value;
  };

  return resolve(input);
}

