async function evaluateExpression(expr, context, helpers = {}) {
    try {
        // Merge helpers and context into evaluation scope
        const scope = { ...context, ...helpers };

        // Wrap `if ...` in a ternary expression automatically
        const ifPattern = /^if\s+(.+?),\s*(.+?),\s*(.+)$/i;
        if (ifPattern.test(expr.trim())) {
            expr = expr.trim().replace(ifPattern, '($1) ? ($2) : ($3)');
        }

        // Async Function constructor to allow await
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
        // Replace placeholders {{ ... }}
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
        // Process each array item recursively
        return Promise.all(input.map(item => resolvePlaceholders(item, context, helpers)));

    } else if (typeof input === 'object' && input !== null) {
        // Recursively process object fields
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
        toUpper: str => String(str).toUpperCase(),
        toLower: str => String(str).toLowerCase(),
        capitalize: str => String(str).charAt(0).toUpperCase() + String(str).slice(1),
        string: str => `"${String(str)}"`,
        dateFormat: date => new Date(date).toLocaleDateString(),
        formatCurrency: num => Number(num).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    };

    const sandbox = { ...context, ...defaultFunctions, ...extraFunctions };

    // Evaluate a single expression safely
    const evalExpression = expr => {
        try {
            // Use Function constructor to allow functions, ternary ops, etc.
            const fn = new Function(...Object.keys(sandbox), `"use strict"; return (${expr});`);
            return fn(...Object.values(sandbox));
        } catch (e) {
            console.error(`Expression evaluation error: "${expr}"`, e.message);
            return null;
        }
    };

    // Recursive resolver for strings, objects, and arrays
    const resolve = value => {
        if (typeof value === 'string') {
            const replaced = value.replace(/\{\{(.*?)\}\}/g, (_, expr) => {
                const result = evalExpression(expr.trim());
                if (typeof result === 'object') {
                    return JSON.stringify(result); // stringify objects inside string
                }
                return result ?? '';
            });

            // Try parsing to JSON if possible
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