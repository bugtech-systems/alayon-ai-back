function evaluatePlaceholders(input, context = {}, extraFunctions = {}) {
    const defaultFunctions = {
        toUpper: str => String(str).toUpperCase(),
        toLower: str => String(str).toLowerCase(),
        capitalize: str => String(str).charAt(0).toUpperCase() + String(str).slice(1),
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

// Example Usage:
const context = {
    username: "john",
    user: { name: "alice", age: 20 },
    order: {
        date: "2025-08-10T00:00:00Z",
        total: 1234.56,
        items: [
            { name: "Apple", qty: 2, price: 1.5 },
            { name: "Banana", qty: 3, price: 0.9 }
        ]
    },
    totalAmount: 2000,
    getAsyncGreeting: async () => "Hello Async!"
};

const template = {
    message: "Hello {{ toUpper(username) }}, you are {{ user.age >= 18 ? 'Adult' : 'Minor' }}.",
    date: "{{ dateFormat(order.date) }}",
    total: "{{ formatCurrency(order.total) }}",
    firstItemNames: "Hello world {{ order.items.map(i => i.name) }}",
    itemNamesJSON: "Hello World: {{ JSON.stringify(order.items.map(i => i.name)) }}",
    orderDetails: "{{ order }}"
};

console.log(evaluatePlaceholders(template, context));
