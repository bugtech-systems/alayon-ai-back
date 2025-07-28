import { Ollama } from '@langchain/community/llms/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { db } from '../models/index.js';
import { removeNullKeys } from '../helpers/helpers.js';


class AIService {
    constructor() {
        this.llm = new Ollama({
            baseUrl: 'http://localhost:11434',
            model: 'mistral', // or 'llama3'
            temperature: 0.1,
            // numCtx: 4096,
            topP: 0.9
        });
    }

    async generateResponse(prompt) {
        return this.llm.invoke(prompt);
    }


    async generateQueryFromNaturalLanguage(naturalQuery, resourceTypeId) {
        console.log('[INPUT] Received query:', { naturalQuery, resourceTypeId });

        // 1. Get resource type information
        const resourceType = await db.ResourceTag.findByPk(resourceTypeId, {
            include: [
                {
                    model: db.ResourceField,
                    as: 'fields',
                    attributes: ['field_name', 'data_type', 'description']
                },
                {
                    model: db.ActionTemplate,
                    as: 'action_templates',
                    where: { is_chat_enabled: true },
                    required: false,
                    include: [{
                        model: db.ActionTemplateParameter,
                        as: 'parameters',
                        required: false
                    }]
                }
            ]
        });

        if (!resourceType) {
            console.error('[ERROR] Resource type not found');
            throw new Error('Resource type not found');
        }

        // 2. Extract parameters from natural language query
        const extractParamsPrompt = new PromptTemplate({
            template: `Analyze this query and extract parameters as key-value pairs:
        
        Query: "{query}"
        
        Available Parameters: {available_params}
        
        Return ONLY a JSON object with the extracted parameters or an empty object if none found.
        Example: {{ "timeframe": "last_quarter", "region": "north_america" }}`,
            inputVariables: ["query", "available_params"]
        });

        const allParamNames = [
            ...new Set(resourceType.action_templates.flatMap(
                t => t.parameters.map(p => p.name)
            ))
        ];

        const paramsExtractionResponse = await this.llm.invoke(
            await extractParamsPrompt.format({
                query: naturalQuery,
                available_params: allParamNames.join(', ')
            })
        );

        const extractedParams = this.safeParseJson(paramsExtractionResponse) || {};
        console.log('[PARAMS] Extracted:', extractedParams);

        // 3. Prepare schema information
        const fieldsInfo = resourceType.fields?.map(f =>
            `- ${f.field_name} (${f.data_type}): ${f.description || 'No description'}`
        ).join('\n') || 'No fields available';

        const actionTemplates = resourceType.action_templates?.map(t => {
            const params = t.parameters?.map(p =>
                `${p.name}${p.required ? ' (required)' : ''}`
            ).join(', ') || 'No parameters';
            return `- ${t.name}: ${t.description} (Parameters: ${params})`;
        }).join('\n') || 'No templates available';

        const prompt = new PromptTemplate({
            template: `You are a database assistant helping users query and generate reports from a {resource_type} resource.
You MUST respond with VALID JSON format ONLY.


Available Fields:
{fields_info}

Available Action Templates:
{action_templates}



User Query: "{query}"


Extracted Parameters:
{extracted_params}


**IMPORTANT RULES**
- parameters: Only extract parameters for 'Available Fields', Merge extracted params with any additional ones you identify.
- template_name: Select only from 'Available Action Templates'.
- Do not come up template_name and parameters not provided or available as options.

`,
            inputVariables: ["resource_type", "query"],
            partialVariables: {
                fields_info: fieldsInfo,
                action_templates: actionTemplates,
                extracted_params: JSON.stringify(extractedParams, null, 2)
            }
        });



        // 5. Execute and parse
        const formattedPrompt = await prompt.format({
            resource_type: resourceType.name,
            query: naturalQuery
        });

        const rawResponse = await this.llm.invoke(formattedPrompt);
        return this.validateOutput(this.safeParseJson(rawResponse));
    }


    async generateQueryFromNaturalLanguageConvo(naturalQuery, session) {

        console.log('[INPUT] Received query:', { naturalQuery, session });

        // 1. Get resource type information


        if (!session.resourceName) {
            throw new Error('Resource type not found');
        }

        // 2. Prepare schema information
        const fieldsInfo = session.resourceFields?.map(f => f.field_name) || [];

        // 3. Generate context-aware prompt
        const prompt = `{
  "resource": "${session.resourceName}",
  "fields": ${JSON.stringify(fieldsInfo)},
  "conversations": ${JSON.stringify(session.history)},
  "prompt": "${naturalQuery.replace(/"/g, '\\"')}",
}

Generate a JSON response with ONLY these two fields:
1. "filterQuery" - Sequelize conditions using ONLY these operators: "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$between", "$in", "$like".
2. "parameters" - Extracted fields key-value pairs from prompt/conversations.

STRICT RULES:
- Extract only value for fields that exist in the provided schema
- Use only values explicitly mentioned in prompt/conversations
- If no conditions can be derived, return empty objects
- NEVER add comments, explanations or extra text

Response MUST be valid JSON in this exact format:
{
  "filterQuery": {},
  "parameters": {}
}`;

        // 4. Configure LLM for precise response
        const response = await this.llm.invoke(prompt, {
            temperature: 0.1,  // Low randomness
            max_tokens: 500,
            response_format: { type: "json_object" } // Force JSON output
        });

        // 5. Validate and return
        try {


            const result = JSON.parse(response);

            // Validate fields exist in schema
            if (result.filterQuery) {
                const invalidFields = Object.keys(result.filterQuery)
                    .filter(field => !fieldsInfo.some(f => f.name === field));

                if (invalidFields.length > 0) {
                    throw new Error(`Invalid fields: ${invalidFields.join(', ')}`);
                }
            }

            return {
                filterQuery: result.filterQuery || {},
                parameters: result.parameters || {},
                template_name: session.template.name
            };
        } catch (error) {
            console.error('Query generation error:', error);
            return { filterQuery: {}, parameters: {} };
        }
    }

    // Helper methods
    safeParseJson(str) {
        try {
            const cleaned = str.replace(/```json|```/g, '');
            return JSON.parse(cleaned);
        } catch (e) {
            console.error('Failed to parse JSON:', str);
            return null;
        }
    }

    validateOutput(output) {
        if (!output?.template_name) {
            throw new Error('Invalid template name in response');
        }
        if (typeof output.parameters !== 'object') {
            output.parameters = {};
        }
        return output;
    }

    async formatResultsForUser(results = [], query, explanation) {
        let newResults = results.map(a => removeNullKeys(a))
        const prompt = `
You are Alayon AI a helpful assistant to report data results to non-technical users. Do not halucinate data values response.

##CONTEXT:
${JSON.stringify(newResults)}


##PROMPT
User asked: "${query}"

##RULE
Important Instruction:
${explanation}


Important Rules:
1. Present the information in a clear, non-technical manner.
2. Analyze carefully and understand the data context key value pairs in JSON.
3. Response should be short, precise, SMS Friendly.
4. Do not provide recommendations or suggestions.
5. Respond the data objects that user asked or specified to provide.



Response:
    `;

        return this.generateResponse(prompt);
    }

    buildOllamaPrompt(actions, userInput) {
        let resources = [...new Set(actions.map(a => a.resource))]
        return `
  Objective: Identify the matching "action template", with exact match of "action" and "resource" from the user's input below. 

##CONTEXT:
Template Options: 
  ${JSON.stringify(actions.map((a, index) => a.name), null, 2)}

Action Options:
create, update, delete, read, create_relationship, clear

Resource Options:
 ${JSON.stringify(resources, null, 2)}

**Important**:
 - Select only from options provided.
 - From action and resource analyze and find the template match.
 - If no template match. Set action and template to null.
 - Set action to clear if user wants to clear context or clear question.
 - Respond in JSON ${JSON.stringify({ template: "string | null", action: "string | null", resource: "string | null" })} format.
 - Do not come-up with value not specified in the options. Do not provide recommendations or suggestions.



##QUESTION:
  User Input: "${userInput}"

##ANSWER:
  Output(JSON):
  `;
    }

    /**
 * Generates an AI prompt for key-value extraction with context awareness
 * @param {string} currentPrompt - The user's latest message
 * @param {string} previousContext - Summary of previous relevant messages
 * @param {string[]} requestedFields - Fields user asked to extract
 * @param {string[]} requiredFields - Subset that must be populated
 * @returns {string} - Formatted prompt for the AI
 */

    createExtractionPrompt(currentPrompt, previousContext, requestedFields, requiredFields) {
        // Validate inputs
        if (!requestedFields || requestedFields.length === 0) {
            throw new Error('requestedFields must contain at least one field');
        }


        return `
You are a precise information extraction assistant. Follow these rules:

1. EXTRACTION SCOPE:
- Only extract these requested fields: ${requestedFields.join(', ')}
- Required fields: ${requiredFields.length > 0 ? requiredFields.join(', ') : 'none'}
- Never assume values for unspecified fields

2. CONTEXT HANDLING:
Previous conversation context:
"""
${previousContext || 'No previous context provided'}
"""


3. CURRENT PROMPT ANALYSIS:
"""
${currentPrompt}
"""

4. PROCESSING INSTRUCTIONS:
a) First scan current prompt for explicit key-value pairs
b) Cross-reference with previous context only when:
   - Current prompt implies continuation
   - Previous values directly complete current fields
c) For missing required fields, generate specific follow-up questions
d) confidence: 0-4 scale based on response certainty, if exists in the context:
        4 = Very Confident
        3 = Confident
        0-2 = Not Confident 


5. OUTPUT FORMAT (as JSON):
{
  "status": "complete|incomplete",
  "filter": { /* Sequelize where clause */ },
  "params": { 
      ${requestedFields.map(f => `"${f}": "[extracted_value|null]"`).join(',\n    ')}
  },
  "explanation": "concise question to get missing information | any relevant observations about context",
  "confidence": number
}

6. SPECIAL CASES:
- If field is ambiguous: Ask which interpretation is correct
- If context contradicts current prompt: Flag and confirm
- If overriding previous value: Note the change explicitly

Now process the above prompt and context to extract the requested information.`;
    }

    generateActionConfirm(actionType, currentData, proposedData, entityName) {

        // Build change list
        const changes = [];
        if (actionType === 'UPDATE') {
            Object.entries(proposedData).forEach(([field, val]) =>
                changes.push(`${field}:${currentData[field]}→${val}`));
        } else if (actionType === 'CREATE') {
            changes.push(...Object.entries(proposedData).map(([f, v]) => `${f}=${v}`));
        }

        // Action impact
        const impacts = {
            'UPDATE': `Will update ${changes.length} fields`,
            'CREATE': `New ${entityName} with ${changes.length} fields`,
            'DELETE': `PERMANENT deletion`
        };

        return `Confirm ${actionType} ${entityName}?
${changes.join(', ')}

${impacts[actionType]}
❗Cannot undo

Reply:
Y - Confirm
N - Cancel
M - Modify
? - Details`.slice(0, 700); // Hard limit
    }





    /**
     * Calls Ollama to process the prompt.
     */


    async callOllama(prompt) {
        try {

            const response = await this.llm.generate([prompt])



            return response.generations[0];
        } catch (error) {
            console.error("Ollama API error:", error.message);
            throw new Error("Failed to process request with Ollama.");
        }
    }
}

// Create a single instance and export it
const aiService = new AIService();
export default aiService;