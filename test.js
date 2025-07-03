// ollamaModelCreator.mjs
import ollama from 'ollama';


const dbQueryAssistant = {
    model: 'alayon',
    from: 'mistral:latest',
    stream: false, // Set to true if you want streaming responses
    system: `You are a PostgreSQL/Sequelize query generator that outputs JSON with:
1. filter: Sequelize where clause using ONLY fields mentioned in the prompt
2. params: Extracted key-value pairs from the prompt
3. explanation: Clear reasoning for the generated filter
4. confidence: 0-4 scale based on field certainty

Available Fields:
- id, type, name, attributes.{any}, resource_parent_id, 
- is_deleted, created_at, updated_at

Response Template:
{
  "filter": { /* Sequelize where clause */ },
  "params": { /* extracted key-values */ },
  "explanation": "text",
  "confidence": number
}`,
    parameters: {
        temperature: 0.3,
        top_p: 0.9,
        num_ctx: 2048
    },
    messages: [
        // Few-shot learning examples
        {
            role: 'user',
            content: 'Find blue resources with type "storage"'
        },
        {
            role: 'assistant',
            content: JSON.stringify({
                filter: {
                    attributes: { color: 'blue' },
                    type: 'storage'
                },
                params: {
                    color: 'blue',
                    type: 'storage'
                },
                explanation: 'Filters for storage-type resources with blue color attribute',
                confidence: 4
            })
        },
        {
            role: 'user',
            content: 'Show deleted items from last week'
        },
        {
            role: 'assistant',
            content: JSON.stringify({
                filter: {
                    is_deleted: true,
                    updated_at: {
                        $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    },
                    params: {
                        status: 'deleted',
                        timeframe: 'last week'
                    },
                    explanation: 'Deleted items updated in the past 7 days',
                    confidence: 3
                }
            })
        },
        {
            role: 'user',
            content: 'Find important documents'
        },
        {
            role: 'assistant',
            content: JSON.stringify({
                filter: {},
                params: {
                    importance: 'high'
                },
                explanation: 'No field mapping for "important documents"',
                confidence: 0
            })
        }
    ]
};


/**
 * Creates a new model in Ollama
 * @param {Object} options - Creation options
 * @param {string} options.model - Name of the new model
 * @param {string} options.from - Base model to derive from
 * @param {boolean} [options.stream=false] - Whether to stream progress
 * @param {string} [options.quantize] - Quantization level
 * @param {string} [options.template] - Prompt template
 * @param {string|string[]} [options.license] - Model license(s)
 * @param {string} [options.system] - System prompt
 * @param {Object} [options.parameters] - Additional parameters
 * @param {Array} [options.messages] - Initial chat messages
 * @param {Object} [options.adapters] - LoRA adapter configurations
 * @returns {Promise<Object>} Progress response
 */
export async function createModel(options) {
    try {
        const response = await ollama.create({
            model: options.model,
            from: options.from,
            stream: options.stream || false,
            ...(options.quantize && { quantize: options.quantize }),
            ...(options.template && { template: options.template }),
            ...(options.license && { license: options.license }),
            ...(options.system && { system: options.system }),
            ...(options.parameters && { parameters: options.parameters }),
            ...(options.messages && { messages: options.messages }),
            ...(options.adapters && { adapters: options.adapters })
        });

        if (options.stream) {
            for await (const progress of response) {
                console.log(`Progress: ${progress.status} - ${progress.completed}/${progress.total}`);
            }
        }

        return response;
    } catch (error) {
        console.error('Error creating model:', error);
        throw error;
    }
}

/**
 * Example usage
 */
async function main(prompt) {
    try {
        console.log('Creating custom model...');
        const query = {
            ...dbQueryAssistant,
            messages: [
                ...dbQueryAssistant.messages,
                /*  {
                     role: 'user',
                     content: prompt
                 } */
            ]
        };


        const result = await createModel(query)

        /*       const result = await createModel({
                  model: 'alayon',
                  from: 'mistral:latest',
                  stream: true,
                  system: 'You are LYNDE AI, A Helpful AI Assistant for Data Platform.',
                  parameters: {
                      temperature: 0.2,
                      top_p: 0.9,
                      num_ctx: 500
                  },
                  messages: [
                      {
                          role: 'user',
                          content: 'What the english of tungaw?'
                      },
                      {
                          role: 'assistant',
                          content: 'The Word "Tungaw" means Tiny 4k insect or bug..'
                      }
                  ] 
              }); */

        console.log('Model created successfully:', result);
    } catch (error) {
        console.error('Failed to create model:', error);
    }
}

// Run the example
main('Find active config resources with priority > 5 created this month.');