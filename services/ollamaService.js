// services/ollamaService.js
import { Ollama } from 'ollama';
import { findActionTemplateByName, getFieldsForResource, getResourcesByType, getResourceTypes } from "./ResourceService.js";
import { db } from '../models/index.js';
import { AIAgent } from '../services/aiAgent.js';

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

export const generateWithAi = async (message, config = { model: 'mistral', options: { temperature: 0.3 } }) => {
    const response = await ollama.generate({
        ...config,
        prompt: message,
        options: config.options,
        format: 'json'
    });

    console.log(response, 'generate ai resp')

    return response;
};

export const chatWithAi = async (messages, config = { model: 'mistral', options: { temperature: 0.3 } }) => {


    const response = await ollama.chat({
        ...config,
        messages: messages,
        options: config.options,
        format: 'json'
    });
    console.log(response.prompt_eval_count, 'chat ai resp')

    return response;
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

export async function processActionPrompt(message, session) {
    // let actionTemplates = await getActionTemplates();
    // const resource_names = await getResourcesByType()
    // let conversation = null





    // let conversation = await getConversationMessages(session.id)
    let aiPreset = await db.AiPreset.findOne({ where: { model_name: 'action_selector' }, order: [['id', 'DESC']] });



    let conversation = await db.Conversation.findOne({
        where: { session_id: session.id, ai_preset_id: aiPreset.id }
    })

    if (!conversation) {
        conversation = await db.Conversation.create({ session_id: session.id, ai_preset_id: aiPreset.id })
    }

    console.log(conversation, 'conv')
    const aiAgent = new AIAgent(aiPreset.id, conversation?.id);
    await aiAgent.initialize();




    const response = await aiAgent.generate(message);

    console.log(conversation, 'conv', response)

    // const allowedTemplates = actionTemplates.map(t => ({
    //     name: t.name,
    //     description: t.description,
    //     // samples: t.samples.slice(0, 3) // Limit to 3 samples
    // }));









    // let messages = session.history;
    // Prepare messages for Mistral
    // messages.push({
    //     role: 'system',
    //     content: SYSTEM_INSTRUCTION
    // })
    // let context = formatConversation(messages)

    /*   conversations.map(m => {
          messages.push({
              role: m.role,
              content: m.content
          })
      }); */












    // let structuredPrompt = {
    //     context: context?.substring(0, 1000), // Truncate long context
    //     user_prompt: message,
    //     // allowed_templates: allowedTemplates,
    //     // allowed_resources: resource_names.map(a => a.resource_name),
    //     // token_budget: 1024 // For AI reference
    // };

    // Generate AI response


    // let message = `${SYSTEM_INSTRUCTION}`

    // let structuredMessages = [
    //     {
    //         role: "system",
    //         content: aiPreset.system_instruction
    //     },
    //     {
    //         role: "user",
    //         content: JSON.stringify(structuredPrompt)
    //     }
    // ]



    // let response = await chatWithAi(structuredMessages, {
    //     model: aiPreset.name,
    //     format: 'json',
    //     options: aiPreset.parameters
    //     // top_p: 0.3, // Further reduce randomness
    //     // numCtx: 4096
    // });



    let resJson = response


    let template = await findActionTemplateByName(response.selected_template);

    if (!template) {
        resJson.selected_template = null;
    } else {
        resJson.template = template;
    }

    // // Save AI response
    // await db.Conversation.create({
    //     title: 'alayon_action',
    //     prompt: prompt,
    //     response: response.response,
    //     sessionId: context.id,
    //     metadata: resJson,
    //     tokens: response.eval_count || 0,
    //     rate: resJson.confidence
    // });
    return resJson
}



export async function processTemplatePrompt(prompt, context) {



    const template = context.template;

    console.log(template, 'TEMPLTE')

    // let conversation = await getConversationMessages(session.id)
    let aiPreset = await db.AiPreset.findOne({
        where: { model_name: 'template_engine' }, order: [['id', 'DESC']]
    });



    console.log(aiPreset.id, 'ai template preset')

    let conversation = await db.Conversation.findOne({
        where: { session_id: context.id, ai_preset_id: aiPreset.id }
    })

    if (!conversation) {
        conversation = await db.Conversation.create({ session_id: context.id, ai_preset_id: aiPreset.id })
    }



    const aiAgent = new AIAgent(aiPreset.id, conversation.id);
    await aiAgent.initialize();





    const resource_type = context.resource_type


    // Prepare messages for Mistral
    // const messages = [];
    // messages.push({
    //     role: 'system',
    //     content: SYSTEM_INSTRUCTION
    // })



    // conversations.map(m => {
    //     messages.push({
    //         role: m.role,
    //         content: m.content
    //     })
    // });

    // messages.push({ role: 'user', content: prompt })


    // let conversation = formatConversation(messages)

    /*   conversations.map(m => {
          messages.push({
              role: m.role,
              content: m.content
          })
      }); */


    let configTemplate = {
        pre_hooks: template.pre_hooks,
        config: template.config,
        post_hooks: template.pre_hooks,
    }


    //     // Structured prompt for Ollama
    const message = `
      Extract key-value pairs from the conversation below to populate the ""parameters"" and ""template_output"" object for a ${template.tool_type} action.
      - Preserve the original template "placeholders" (e.g., {{params.email}}).
      - Only extract values explicitly mentioned in the conversation or "Template Fields" context.
      - Never invent or assume values.
      - Customize template value contents according to the prompt.


      **Template config**: "${JSON.stringify(template.config, null, 2)}"
      **Template fields**:  "${JSON.stringify(template.parameters, null, 2)}"
      
      **output_schema**: {
         action_type: "string",
         parameters: "object",
         template_output: "object",
         missing_fields: "array",
      }
      `



    console.log(message, 'MES')
    // await logMessage(context.id, 'user', message, null)


    // let response = await generateWithAi(message, {
    //     model: aiPreset.model_name,
    //     system: aiPreset.system_instruction,
    //     options: aiPreset.parameters
    // });
    const response = await aiAgent.generate(prompt, message);

    console.log(response, 'MES RESP')

    // let resJson = JSON.parse(response)

    // await logMessage(context.id, 'assistant', response.response, null)

    // // Save AI response
    // await db.Message.create({
    //     role: 'assistant',
    //     tokens: prompt,
    //     content: prompt,
    //     sessionId: context.id,
    //     metadata: resJson,
    //     tokens: response.eval_count || 0,
    //     rate: resJson.confidence
    // });

    // console.log(resJson, 'RSS')


    // if (!template) {
    //     resJson.selected_template = null;
    // }



    return response
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
//                 followUp: `Please confirm this ${ response.method } operation` +
//                     `(confidence: ${ response.confidence } / 5) \n` +
//                     `Summary: ${ response.summary } `
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
                        `Please provide value for: ${field.fieldName} `
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


export async function findBestMatch(options, userInput) {
    // Validation
    if (!Array.isArray(options) || !options.length || typeof userInput !== 'string' || !userInput.trim()) {
        return { match: null, confidence: 0, reason: "Invalid input: empty options or user input" };
    }

    // Preprocess options (preserve originals for response)
    const optionMap = options.reduce((acc, opt) => {
        const normalized = opt.toLowerCase().replace(/\s+/g, ' ').trim();
        acc[normalized] = opt; // Map normalized → original
        return acc;
    }, {});

    const normalizedOptions = Object.keys(optionMap);
    const normalizedInput = userInput.toLowerCase().replace(/\s+/g, ' ').trim();

    // Exact match check (fast path)
    if (optionMap[normalizedInput]) {
        return {
            match: optionMap[normalizedInput],
            confidence: 1.0,
            reason: "Exact normalized match"
        };
    }

    // Structured AI prompt with strict constraints
    const prompt = `
    MATCHING TASK:
    Select the BEST matching option from the provided list ONLY.
    DO NOT invent or suggest options outside the list.

    USER INPUT: "${userInput}"

    AVAILABLE OPTIONS(normalized):
    ${normalizedOptions.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

    STRICT RULES:
    1. MUST select from the listed options ONLY
    2. Consider:
    - Lexical similarity(e.g., "appple" → "apple")
        - Word sequence("New York" ≠ "York New")
            - Term completeness("Big Apple" ≠ "Apple")
    3. Confidence scores:
    1.0 = Perfect match(after normalization)
    0.9 = Minor typo(1 - 2 character difference)
    0.8 = Partial match(≥75 % similarity)
        < 0.7 = No match

    OUTPUT FORMAT(JSON):
    {
        "match": "EXACT_ORIGINAL_OPTION_TEXT_OR_NULL",
            "confidence": 0.0 - 1.0,
                "reason": "Specific matching rule applied"
    } `;

    try {
        const response = await ollama.generate({
            model: 'mistral:7b',
            prompt,
            format: 'json',
            options: {
                temperature: 0.1,
                top_p: 0.3 // Further reduce randomness
            }
        });

        const result = JSON.parse(response.response);
        // Validation layer
        if (result.match) {
            // Verify match exists in original options (case-sensitive check)
            if (!options.includes(optionMap[result.match])) {
                return {
                    match: null,
                    confidence: 0,
                    reason: "AI suggested invalid option"
                };
            }

            // Enforce confidence threshold
            if (result.confidence >= 0.7) {
                return {
                    match: optionMap[result.match],
                    confidence: Math.min(1, Math.max(0, result.confidence)), // Clamp 0-1
                    reason: result.reason || "AI-determined match"
                };
            }
        }

        return { match: null, confidence: 0, reason: "No confident match found" };
    } catch (error) {
        console.error("Matching error:", error);
        return { match: null, confidence: 0, reason: "Processing error" };
    }
}


export async function findMatchAction(options, userInput) {
    // Validation - return null for invalid inputs
    if (!Array.isArray(options) || !options.length || typeof userInput !== 'string' || !userInput.trim()) {
        return null;
    }

    // Create a map of normalized options to original options
    const normalizedInput = userInput.toLowerCase().replace(/\s+/g, ' ').trim();

    // Prepare field information for the prompt
    const fieldDescriptions = options.map(field => {
        let description = `"${field.name}": ${field.description || 'No description'} `;
        return description;
    });

    // Then check for close matches using AI
    const prompt = `
RESOURCE ACTION MATCHING TASK:

# GOAL: 
Strictly match the user's input to ONE of the provided resource actions or return null.

# AVAILABLE ACTIONS(EXACT OPTIONS ONLY):
${options.map((opt, i) => `[${i + 1}] "${opt.name}": ${opt.description || "No description"}`).join('\n')}

# USER INPUT:
    "${normalizedInput}"

# RULES:
    1. ** Exact Match Required **: Return ONLY if the input CLEARLY matches a listed action's name or description.
    2. ** Null Default **: Return null if:
        - No direct match exists(even if semantically close).
    - Input is ambiguous(e.g., partial matches or typos beyond minor spelling variations).
3. ** No Hallucinations **: Never suggest actions outside the provided options.
4. ** Case / Format Insensitive **: Ignore capitalization, extra spaces, or punctuation(e.g., "CreAte-user" ≈ "create user").
5. ** No Explanations **: Return ONLY JSON, no additional text.

# OUTPUT FORMAT:
    { "match": "<EXACT_MATCHED_ACTION_NAME>" } or null
        `;

    // Example expected outputs:
    // 1. Match:    { "match": "createUser" } 
    // 2. No Match: null

    try {
        const response = await ollama.generate({
            model: 'alayon',
            prompt,
            format: 'json',
            options: { temperature: 0.2 }
        });

        const result = JSON.parse(response.response);

        if (result.match) {
            let action = await findActionTemplateByName(result.match)
            return action;
        }
        return null;
    } catch (error) {
        console.error("Matching error:", error);
        return null;
    }
}


