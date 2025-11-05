# Expression Evaluator Documentation

## Overview

The Expression Evaluator is a powerful JavaScript utility that enables dynamic evaluation of expressions, placeholder resolution, and array manipulation within your applications. It supports both synchronous and asynchronous operations, making it ideal for template processing, data transformation, and dynamic configuration.

## Features

- **Expression Evaluation**: Evaluate JavaScript expressions in a secure sandbox
- **Placeholder Resolution**: Replace `{{expression}}` placeholders with evaluated values
- **Array Mapping**: Transform arrays of objects with customizable field mappings
- **Helper Functions**: Built-in utilities for string, date, number, and array manipulation
- **Nested Object Access**: Support for dot notation to access nested properties
- **Error Handling**: Graceful error handling with informative console messages

## Installation

```bash
npm install your-package-name
```

## Basic Usage

### Importing the Module

```javascript
import { 
  evaluateExpression, 
  resolvePlaceholders, 
  evaluatePlaceholders, 
  mapArray 
} from './expressionEvaluator.js';
```

## Core Functions

### 1. `evaluateExpression(expr, context, helpers = {})`

Evaluates a JavaScript expression with provided context and helper functions.

**Parameters:**
- `expr` (String): The expression to evaluate
- `context` (Object): Variables available in the expression
- `helpers` (Object): Additional helper functions

**Returns:** Promise resolving to the evaluation result

**Example:**
```javascript
const result = await evaluateExpression('user.age > 18', { 
  user: { age: 25, name: 'John' } 
});
// Returns: true
```

### 2. `resolvePlaceholders(input, context, helpers = {})`

Asynchronously resolves placeholders in strings, arrays, or objects.

**Parameters:**
- `input` (String|Array|Object): Input containing placeholders
- `context` (Object): Context variables
- `helpers` (Object): Helper functions

**Returns:** Promise resolving to the processed input

**Example:**
```javascript
const template = "Hello {{user.name}}, your balance is {{formatCurrency(user.balance)}}";
const result = await resolvePlaceholders(template, {
  user: { name: 'Alice', balance: 1250.50 }
});
// Returns: "Hello Alice, your balance is $1,250.50"
```

### 3. `evaluatePlaceholders(input, context = {}, extraFunctions = {})`

Synchronously evaluates placeholders in strings, arrays, or objects.

**Parameters:**
- `input` (String|Array|Object): Input containing placeholders
- `context` (Object): Context variables
- `extraFunctions` (Object): Additional helper functions

**Returns:** Processed input with placeholders resolved

**Example:**
```javascript
const result = evaluatePlaceholders(
  "Welcome {{user.name}}! You have {{user.messages.length}} new messages.",
  { user: { name: 'Bob', messages: ['msg1', 'msg2'] } }
);
// Returns: "Welcome Bob! You have 2 new messages."
```

### 4. `mapArray(array, fieldMappings, context = {}, helpers = {})`

Transforms an array of objects using customizable field mappings.

**Parameters:**
- `array` (Array): Input array to transform
- `fieldMappings` (Object): Field definitions and expressions
- `context` (Object): Additional context variables
- `helpers` (Object): Helper functions

**Returns:** Promise resolving to transformed array

**Example:**
```javascript
const users = [
  { id: 1, firstName: 'John', lastName: 'Doe', age: 30 },
  { id: 2, firstName: 'Jane', lastName: 'Smith', age: 25 }
];

const result = await mapArray(users, {
  userId: 'item.id',
  fullName: 'item.firstName + " " + item.lastName',
  isAdult: 'item.age >= 18',
  ageNextYear: 'item.age + 1'
});
```

## Placeholder Syntax

### Basic Placeholders

```javascript
// Simple variable access
"{{user.name}}"

// Expression evaluation
"{{user.age > 18 ? 'Adult' : 'Minor'}}"

// Function calls
"{{formatCurrency(user.balance)}}"
```

### Advanced Placeholders

```javascript
// Object placeholders
const template = {
  message: "Hello {{user.name}}",
  metadata: {
    timestamp: "{{dateNow()}}",
    status: "{{user.status}}"
  }
};

// Array placeholders
const listTemplate = [
  "Item {{index + 1}}: {{item.name}}",
  "Price: {{formatCurrency(item.price)}}"
];

// Nested placeholders
const complexTemplate = {
  summary: "User {{user.id}} has {{user.orders.length}} orders",
  details: "{{mapArray(user.orders, { id: 'item.id', total: 'formatCurrency(item.total)' })}}"
};
```

## Helper Functions

### String Helpers
- `toUpper(str)`: Convert string to uppercase
- `toLower(str)`: Convert string to lowercase
- `capitalize(str)`: Capitalize first letter
- `string(str)`: Wrap string in quotes
- `jsonStringify(obj)`: Convert object to JSON string

### Date Helpers
- `dateFormat(date)`: Format date to locale string
- `dateNow()`: Get current date as ISO string

### Number Helpers
- `formatCurrency(num)`: Format number as currency
- `formatPhoneNumber(num)`: Format phone number

### Array Helpers
- `filterBy(arr, key, value)`: Filter array by key-value pair
- `sumBy(arr, key)`: Sum array values by key
- `count(arr)`: Count array elements
- `mapBy(arr, key)`: Map array to specific key values
- `get(obj, path, defaultValue)`: Safe nested property access

### Array Mapping Helpers (in `mapArray`)
- `filter(arr, condition)`: Filter array with custom condition
- `find(arr, condition)`: Find element in array
- `sort(arr, key, direction)`: Sort array by key
- `groupBy(arr, key)`: Group array by key
- `chunk(arr, size)`: Split array into chunks
- `join(arr, separator)`: Join array elements
- `first(arr)`: Get first array element
- `last(arr)`: Get last array element
- `sum(arr)`: Sum array values
- `average(arr)`: Calculate average
- `min(arr)`: Find minimum value
- `max(arr)`: Find maximum value

## Array Mapping with `mapArray`

### Basic Field Mapping

```javascript
const data = [
  { id: 1, name: 'Product A', price: 29.99, category: 'electronics' },
  { id: 2, name: 'Product B', price: 49.99, category: 'books' }
];

const result = await mapArray(data, {
  productId: 'item.id',
  productName: 'item.name',
  formattedPrice: 'formatCurrency(item.price)',
  category: 'item.category.toUpperCase()'
});
```

### Nested Object Access

```javascript
const users = [
  {
    id: 1,
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      contact: {
        email: 'john@example.com',
        phone: '1234567890'
      }
    }
  }
];

const result = await mapArray(users, {
  userId: 'item.id',
  fullName: 'item.profile.firstName + " " + item.profile.lastName',
  email: 'item.profile.contact.email',
  formattedPhone: 'formatPhoneNumber(item.profile.contact.phone)'
});
```

### Using Array Helpers

```javascript
const orders = [
  { id: 1, items: ['item1', 'item2', 'item3'], status: 'completed' },
  { id: 2, items: ['item4'], status: 'pending' }
];

const result = await mapArray(orders, {
  orderId: 'item.id',
  itemCount: 'item.items.length',
  itemList: 'join(item.items, ", ")',
  hasMultipleItems: 'item.items.length > 1',
  status: 'item.status.toUpperCase()'
});
```

### Complex Transformations

```javascript
const employees = [
  { id: 1, name: 'Alice', department: 'IT', salary: 60000, years: 3 },
  { id: 2, name: 'Bob', department: 'HR', salary: 55000, years: 5 }
];

const result = await mapArray(employees, {
  employeeId: 'item.id',
  displayName: 'capitalize(item.name)',
  department: 'item.department',
  annualSalary: 'formatCurrency(item.salary)',
  monthlySalary: 'formatCurrency(item.salary / 12)',
  experience: 'item.years + " years"',
  isSenior: 'item.years > 4',
  bonusEligible: 'item.department === "IT" && item.years > 2'
});
```

### Function Expressions

```javascript
const products = [
  { id: 1, name: 'Laptop', price: 999.99, stock: 15 },
  { id: 2, name: 'Mouse', price: 25.99, stock: 100 }
];

const result = await mapArray(products, {
  productId: (item) => item.id,
  description: (item, index) => `${index + 1}. ${item.name} - ${formatCurrency(item.price)}`,
  stockStatus: (item) => item.stock > 20 ? 'In Stock' : 'Low Stock',
  metadata: (item) => ({
    name: item.name.toUpperCase(),
    value: item.price * 1.1 // Add 10% tax
  })
});
```

## Advanced Use Cases

### Dynamic Template Generation

```javascript
const userData = {
  user: {
    name: 'Sarah',
    orders: [
      { id: 101, product: 'Book', price: 19.99 },
      { id: 102, product: 'Pen', price: 2.99 }
    ]
  }
};

const emailTemplate = {
  subject: "Order Confirmation for {{user.name}}",
  body: `
    Dear {{user.name}},
    
    Thank you for your order! Here are your order details:
    
    {{mapArray(user.orders, {
      product: 'item.product',
      price: 'formatCurrency(item.price)'
    })}}
    
    Total: {{formatCurrency(sumBy(user.orders, 'price'))}}
    
    Best regards,
    The Team
  `
};

const processedEmail = await resolvePlaceholders(emailTemplate, userData);
```

### Configuration Processing

```javascript
const configTemplate = {
  api: {
    endpoint: "{{env.API_HOST}}/v1/{{env.API_VERSION}}",
    timeout: "{{env.TIMEOUT || 5000}}"
  },
  features: {
    enabled: "{{env.NODE_ENV === 'production'}}",
    logging: "{{env.DEBUG === 'true'}}"
  }
};

const processedConfig = evaluatePlaceholders(configTemplate, {
  env: {
    API_HOST: 'https://api.example.com',
    API_VERSION: '2',
    NODE_ENV: 'production',
    DEBUG: 'false'
  }
});
```

### Data Transformation Pipeline

```javascript
async function transformData(rawData, transformations) {
  // Step 1: Clean and validate data
  const cleanedData = await mapArray(rawData, {
    id: 'item.id',
    name: 'item.name.trim()',
    email: 'item.email.toLowerCase()',
    isValid: 'item.email.includes("@") && item.name.length > 0'
  });
  
  // Step 2: Apply business logic transformations
  const transformedData = await mapArray(cleanedData, {
    userId: 'item.id',
    displayName: 'capitalize(item.name)',
    email: 'item.email',
    domain: 'item.email.split("@")[1]',
    status: 'item.isValid ? "VALID" : "INVALID"',
    metadata: {
      processedAt: 'dateNow()',
      source: 'transformations.source'
    }
  }, { transformations });
  
  return transformedData;
}
```

## Error Handling

The expression evaluator provides comprehensive error handling:

```javascript
try {
  const result = await evaluateExpression('invalid.expression', {});
} catch (error) {
  console.error('Evaluation failed:', error.message);
  // Fallback to default value
  const fallback = evaluatePlaceholders('{{defaultValue}}', { defaultValue: 'fallback' });
}
```

## Security Considerations

- Expressions are evaluated in a sandboxed environment
- No direct access to global scope or sensitive APIs
- Always validate and sanitize user input before evaluation
- Use the `get()` helper for safe nested property access

## Performance Tips

- Cache frequently used expressions
- Pre-compile templates when possible
- Use synchronous `evaluatePlaceholders` for simple operations
- Batch process arrays when dealing with large datasets

## Browser Compatibility

The expression evaluator works in all modern browsers and Node.js environments. For older browsers, you may need to polyfill:
- Promise
- Object.entries
- Array methods (map, filter, reduce, etc.)

## License

MIT License - feel free to use in your projects.

## Support

For issues and questions, please check the GitHub repository or create an issue in the project tracker.

---

This comprehensive expression evaluator provides powerful capabilities for dynamic content generation, data transformation, and template processing in your JavaScript applications.