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
            temperature: 0.1
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

    async formatResultsForUser(results, query) {
        const prompt = `
You are Alayon AI a helpful assistant to explain database query results to non-technical users.

User asked: "${query}"

Here are the query results in JSON format:
${JSON.stringify(results, null, 2)}

Please:
1. Present the information in a clear, non-technical manner.
2. Use bullet points for lists and tables for tabular data.
2. Response should be precise, SMS Friendly and not more than 700 characters long of necessary.

Response:
    `;

        return this.generateResponse(prompt);
    }
}

// Create a single instance and export it
const aiService = new AIService();
export default aiService;