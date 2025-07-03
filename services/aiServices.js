import { Ollama } from '@langchain/community/llms/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { db } from '../models/index.js';


class AIService {
    constructor() {
        this.llm = new Ollama({
            baseUrl: 'http://localhost:11434',
            model: 'mistral', // or 'llama3'
            temperature: 0.1,
            top_p: 0.9
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


            console.log(prompt, response, 'ai resp')
            const result = JSON.parse(response);
            console.log(result, 'ai results', fieldsInfo)

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

    async formatResultsForUser(results, query, explanation) {
        console.log(explanation, 'EXPLAIN')

        const prompt = `
You are Alayon AI a helpful assistant to explain data results to non-technical users.

User asked: "${query}"



Here are the data results in JSON format:
${JSON.stringify(results, null, 2)}

**Action Result**:
${explanation}

Important Rules:
1. Present the information in a clear, non-technical manner.
2. Use bullet points for lists and tables for tabular data.
3. Response should be short, precise, SMS Friendly.
4. Response Should be In a human readable, organize format.
5. Provide brief information about the action.

Response:
    `;
        console.log(prompt, 'USER RESP')
        return this.generateResponse(prompt);
    }

    buildOllamaPrompt(actions, userInput) {
        let resources = [...new Set(actions.map(a => a.resource))]
        return `
  Objective: Identify the matching "action template", with exact match of "action" and "resource" from the user's input below. 
  Return ${JSON.stringify({ template: "string | null", action: "string | null", resource: "string | null" })} format.

Template Options:
  ${JSON.stringify(actions, null, 2)}

Allowed Actions (with keywords):
 - **read**: (provide | get | list | view | give | find)
 - **create**: (new | create | add | setup)
 - **update**: (modify | edit | update | change)
 - **delete**: (remove | clear | forget)

Allowed Resources:
 ${JSON.stringify(resources, null, 2)}


 **Important**:
 - Return template null if no exact matching for action resource pair.
 - Select only from options provided.
 - Template action and resource should match.
 - Respond in JSON.

  User Input: "${userInput}"

  Output(JSON):
  `;
    }

    /**
     * Calls Ollama to process the prompt.
     */


    async callOllama(prompt) {
        try {
            console.log(prompt, 'PROMPT')

            const response = await this.llm.generate([prompt])


            console.log(response, 'RESPONSEE')

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