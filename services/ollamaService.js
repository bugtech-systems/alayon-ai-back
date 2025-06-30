// services/ollamaService.js
import axios from "axios";
import { Ollama } from 'ollama';
import { getFieldsForResource, getResourceTypes } from "./resourceService.js";

// Initialize Ollama client with your server configuration
const ollama = new Ollama({
    host: 'http://127.0.0.1:11434' // default Ollama port
});


export const resourceConfig = {
    fields: [
        {
            fieldName: "name",
            dataType: "string",
            name: "Organization Name",
            required: true
        },
        // ... other fields from your config
    ],
    types: ['config', 'connections', 'resource'],
    names: ['organizations', 'navigations'] // add more as needed
};

export const chatWithAI = async (messages) => {
    const { data } = await axios.post("http://127.0.0.1:11434/api/chat", {
        model: "mistral",
        messages,
        stream: false,
        options: {
            temperature: 0.3,
            top_p: 0.95,
        }
    });
    return data.message.content;
};


// Define the instruction as a constant
const INSTRUCTION = `
You are a MongoDB query generator for ResourceTag documents that identifies CRUD operations.
Respond ONLY with JSON in this format:
{
  "method": "create|get|update|delete",
  "data": {},
  "query": {
    "filter": {},
    "update": {},
    "options": {}
  },
  "followup": ""
}

Resource Configuration:
- Types: ${resourceConfig.types.join(', ')}
- Names: ${resourceConfig.names.join(', ')}
- Fields: ${resourceConfig.fields.map(f => f.fieldName).join(', ')}

Rules:
1. For create: Must include required fields (${resourceConfig.fields.filter(f => f.required).map(f => f.fieldName).join(', ')})
2. For query: Can filter by values fieldName and value
3. Type and Name must come from allowed values
4. Include confidence score (1-5) based on:
     - Completeness of required fields
     - Clarity of operation intent
     - Specificity of filters/updates
5. Always summarize the proposed changes
`;



export async function generateQueryWithConfig(prompt, session) {
    const context = {
        organization: session.state.organization,
        resourceName: session.state.resourceName,
        action: session.action,
        collectedData: session.state,
        requiredFields: session.state.requiredFields

    };


    console.log(prompt, context, 'configwssith', await buildPrompt(prompt, context))

    const response = await ollama.generate({
        model: 'mistral:7b',
        prompt: await buildPrompt(prompt, context),
        format: 'json'
    });

    // return processResponse(response, context);

    const result = JSON.parse(response.response);

    console.log(result, 'RESW')
    const { missingFields, followUpQuestions } = validateRequiredFields(
        result.method,
        result.data,
        resourceConfig.fields
    );

    console.log(result, 'RESW', missingFields, followUpQuestions)


    if (missingFields.length > 0) {
        result.stage = 'requirements';
        result.missingFields = missingFields;
        result.followUp = followUpQuestions.join('\n');
        result.complete = false;
    } else {
        result.stage = 'confirmation';
        result.complete = true;
        result.summary = generateOperationSummary(result);
    }


    result.confidence = generateConfidenceScore(result);
    return result;


}

async function buildPrompt(prompt, context) {
    let fields = await getFieldsForResource(context.resourceName)
    const types = await getResourceTypes();




    return `
You are a MongoDB query generator for ResourceTag documents. Follow these rules:

1. Available Types: ['config','connections','resource']
2. Available Names: [${types}]
3. Required Fields: [${fields}]
4. Response Format:
{
  "method": "create|get|update|delete",
  "data": {
    "type": "<type>",
    "name": "<name>",
    "values": [
      {"fieldName": "<field>", "value": "<value>"}
    ]
  },
  "query": {
    "filter": {},
    "update": {},
    "options": {}
  }
}

ADDITIONAL RULES:
  5. Include confidence score (1-5) based on:
     - Completeness of required fields
     - Clarity of operation intent
     - Specificity of filters/updates
  6. Always summarize the proposed changes

Generate query for: ${prompt}
 `;
}

function processResponse(response, context) {
    try {
        const result = JSON.parse(response.response);

        // Validation
        if (!result.method || !['create', 'get', 'update', 'delete'].includes(result.method)) {
            throw new Error('Invalid method in response');
        }



        // Calculate confidence
        result.confidence = calculateConfidence(result, context);

        // Field validation
        const missingFields = validateFields(result, context);
        result.missingFields = missingFields;

        return result;
    } catch (error) {
        console.error('Response processing error:', error);
        throw new Error('Invalid response format from Ollama');
    }
}


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

function validateFields(result, context) {
    if (result.method !== 'create') return [];

    return context.requiredFields.filter(field => {
        return !result.data.values?.some(v => v.fieldName === field);
    });
}


// export const queryResource = async (req, res) => {
//     try {
//         const { prompt, state = {} } = req.body;

//         // Generate query with context from previous state
//         const response = await generateQueryWithConfig(prompt, state);

//         // Handle incomplete requirements
//         if (response.stage === 'requirements') {
//             return res.json({
//                 stage: 'requirements',
//                 status: 'missing_fields',
//                 method: response.method,
//                 missingFields: response.missingFields,
//                 followUp: response.followUp,
//                 currentData: response.data || {},
//                 confidence: response.confidence,
//                 requiredFields: resourceConfig.fields
//                     .filter(f => f.required)
//                     .map(f => ({
//                         fieldName: f.fieldName,
//                         name: f.name,
//                         description: f.description
//                     }))
//             });
//         }

//         // Handle confirmation stage
//         if (!req.body.confirm && response.stage === 'confirmation') {
//             return res.json({
//                 stage: 'confirmation',
//                 method: response.method,
//                 summary: response.summary,
//                 confidence: response.confidence,
//                 data: response.data,
//                 query: response.query,
//                 followUp: `Please confirm this ${response.method} operation ` +
//                     `(confidence: ${response.confidence}/5)\n` +
//                     `Summary: ${response.summary}`
//             });
//         }

//         // Execute operation after all requirements met and confirmed
//         let result;
//         switch (response.method) {
//             case 'create':
//                 result = await resourceTagService.createWithConfig(response.data);
//                 break;
//             // ... other cases
//         }

//         res.json({
//             stage: 'completed',
//             success: true,
//             method: response.method,
//             result,
//             followUp: generateCompletionMessage(response.method, result)
//         });

//     } catch (error) {
//         handleErrorResponse(res, error);
//     }
// };

function generateCompletionMessage(method, result) {
    const baseMessages = {
        create: `Successfully created with ID ${result._id}`,
        get: `Found ${result.length} records`,
        update: `Updated ${result.modifiedCount} documents`,
        delete: `Deleted ${result.deletedCount} documents`
    };

    return baseMessages[method] || 'Operation completed successfully';
}

function handleErrorResponse(res, error) {
    let followUp = "Please try again with a different prompt.";
    if (error.message.includes('required')) {
        followUp = "Missing required information. Please provide all necessary details.";
    }

    res.status(400).json({
        success: false,
        error: error.message,
        followUp,
        confidence: 1
    });
}

const validateRequiredFields = (method, data, fieldsConfig) => {
    const missingFields = [];
    const followUpQuestions = [];

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
    }

    return { missingFields, followUpQuestions };
};

function generateOperationSummary({ method, data, query }) {
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

const generateConfidenceScore = (response) => {
    let score = 5; // Start with maximum confidence

    // Deduct points for potential issues
    if (!response.data?.name) score -= 1;
    if (response.method === 'create' && !response.data?.values?.length) score -= 1;
    if (response.method === 'update' && !response.query?.update) score -= 1;

    return Math.max(1, Math.min(5, score)); // Keep between 1-5
};

// export async function findBestMatch(options, userInput, context = {}) {
//     const prompt = `
//     Conversation Context:
//     ${context.lastFollowUp ? "Last prompt: " + context.lastFollowUp : "New conversation"}

//     Available Options:\n
//         ${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

//     User Input: "${userInput}"

//     Instructions:
//     1. Select the best match considering:
//        - Semantic meaning
//        - Related terms
//        - Common abbreviations
//     2. If no good match exists, explain why politely
//     3. Suggest similar valid options when appropriate
//     4. Maintain friendly, helpful tone

//     Respond in this JSON format:
//     {
//       "match": "exact_option_or_null",
//       "message": "polite_explanation",
//       "suggestions": ["similar_option1", ...]
//     }`;

//     const response = await ollama.generate({
//         model: 'mistral:7b',
//         prompt,
//         format: 'json',
//         options: { temperature: 0.4 } // Balanced creativity
//     });
//     console.log(response, 'sssssaaaa', options, prompt)

//     return JSON.parse(response.response);
// }


export async function findBestMatch(options, userInput) {
    if (!options?.length || !userInput?.trim()) {
        return { match: null, confidence: 0, reason: "Empty options or input" };
    }

    // Preprocess: Normalize options and input (lowercase + trim extra spaces)
    const normalizedOptions = options.map(opt =>
        opt.toLowerCase().replace(/\s+/g, ' ').trim()
    );
    const normalizedInput = userInput.toLowerCase().replace(/\s+/g, ' ').trim();

    // Check for direct matches first (fast path)
    const exactMatchIndex = normalizedOptions.indexOf(normalizedInput);
    if (exactMatchIndex !== -1) {
        return {
            match: options[exactMatchIndex], // Return ORIGINAL case option
            confidence: 1.0,
            reason: "Exact match (case/space normalized)"
        };
    }

    // Fuzzy matching prompt for typos
    const prompt = `
    **Task**: Find the option matching: "${userInput}"

    **Available Options (Normalized)**:
    ${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

    **Rules**:
    1. Match ONLY if:
       - Same words in order (case/space insensitive)
       - Minor typos (e.g., "appple" → "apple")
    2. REJECT if:
       - Words rearranged ("York New" ≠ "New York")
       - Extra/missing words ("Big Apple" ≠ "Apple")
    3. Return NULL unless clearly matching.

    **Response (JSON)**:
    {
      "match": "ORIGINAL_OPTION_TEXT_OR_NULL",
      "confidence": 0.6-1.0,
      "reason": "Brief explanation"
    }`;

    const response = await ollama.generate({
        model: 'mistral:7b',
        prompt,
        format: 'json',
        options: { temperature: 0.1 } // Low creativity for precision
    });

    // Parse and validate
    let result;
    try {
        result = JSON.parse(response.response);

        // Verify the match exists ORIGINALLY (case-sensitive)
        if (result.match && !options.includes(result.match)) {
            result = { match: null, confidence: 0, reason: "Invalid option suggested" };
        }

        // Auto-reject low-confidence matches
        if (result.confidence < 0.7) {
            result.match = null;
        }
    } catch (e) {
        result = { match: null, confidence: 0, reason: "Invalid response" };
    }

    return result;
}


