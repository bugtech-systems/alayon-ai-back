import axios from 'axios';
import { db } from '../models/index.js';
import ollama from 'ollama';
import { Op } from 'sequelize';

// Get directory name in ESM

const dbQueryAssistant = {
    model: 'alayon',
    from: 'mistral:latest',
    stream: false, // Set to true if you want streaming responses
    system: `You are a PostgreSQL/Sequelize query generator that outputs JSON with:
1. filter: Sequelize where clause using ONLY fields mentioned in the prompt
2. params: Extracted key-value pairs from the prompt
3. explanation: Clear reasoning for the generated filter
4. confidence: 0-4 scale based on response certainty, if exists in the context.


Available Fields:
- id, type, name, attributes.{any}, resource_parent_id, is_deleted, created_at, updated_at

Important Rules
1. Type should only ['config','resource', 'connection']
2. Any key-value pairs other than "type", "name", "is_delete", "created_at", should be "attributes" fields
3. If not sure about the prompt or not sure of your response, set confidence to 0.

Response Template:
{
  "filter": { /* Sequelize where clause */ },
  "params": { /* Extracted key value pairs */ },
  "explanation": "text",
  "confidence": number
}`,
    parameters: {
        temperature: 0.1,
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
                confidence: 3
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




export default class OllamaFineTuner {
    constructor(baseUrl = 'http://127.0.0.1:11434') {
        this.baseUrl = baseUrl;


    }



    async loadDataset(conversationId, limit = 50, offset = 0) {
        try {
            const messages = await db.Conversation.findAll({
                where: {
                    rate: {
                        [Op.gte]: 4
                    }
                },
                order: [['created_at', 'ASC']],
                limit,
                offset,
            });


            console.log(messages, 'MESSAGE')
            return messages;
        } catch (error) {
            throw new Error(`Failed to load dataset: ${error.message}`);
        }
    }

    async deleteDataset() {
        try {
            const messages = await db.Conversation.destroy({
                where: {
                    rate: {
                        [Op.lt]: 4
                    }
                },
            });


            console.log(messages, 'MESSAGE')
            return messages;
        } catch (error) {
            throw new Error(`Failed to load dataset: ${error.message}`);
        }
    }

    async loadConversations(conversationId, limit = 50, offset = 0) {
        try {
            const messages = await db.Conversation.findAll({
                where: {},
                order: [['created_at', 'ASC']],
                limit,
                offset,
            });


            console.log(messages, 'MESSAGE')
            return messages;
        } catch (error) {
            throw new Error(`Failed to load dataset: ${error.message}`);
        }
    }

    async createModelfile(options) {
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

    async fineTune(modelName, parameters = dbQueryAssistant.parameters) {

        try {
            // 1. Verify directories

            // 2. Load dataset
            const dataset = await this.loadDataset();

            let messages = [];

            dataset.map(a => {
                messages.push({
                    role: 'user',
                    content: a.prompt
                });
                messages.push({
                    role: 'assistant',
                    content: JSON.stringify(a.metadata)
                });
            })



            console.log(messages, 'MESSAGES')
            const query = {
                ...dbQueryAssistant,
                parameters,
                messages: [...dbQueryAssistant.messages, ...messages]
            };




            // 3. Create modelfile
            const modelfile = await this.createModelfile(query);





            return {
                // ...response.data,
                modelfile,
                modelName,
                dataset: query.messages
            };
        } catch (error) {
            // Clean up temp file if it exists

            const errMsg = error.response?.data?.error || error.message;
            throw new Error(`Fine-tuning failed: ${errMsg}`);
        }
    }


    /**
     * Validate training dataset
     * @param {Array} dataset - Training dataset to validate
     * @throws {Error} - If dataset is invalid
     */

    /**
      * List available models
      * @returns {Promise<Array>} - List of available models
      */
    async listModels() {
        try {
            const response = await axios.get(`${this.baseUrl}/api/tags`);
            return response.data.models;
        } catch (error) {
            console.error('Error listing models:', error.message);
            throw error;
        }
    }

    /**
     * Delete a model
     * @param {String} modelName - Name of the model to delete
     * @returns {Promise} - Promise resolving when deletion is complete
     */
    async deleteModel(modelName) {
        try {
            const response = await axios.delete(`${this.baseUrl}/api/delete`, {
                data: { name: modelName }
            });
            return response.data;
        } catch (error) {
            console.error('Error deleting model:', error.message);
            throw error;
        }
    }

    async rateConvo(id, rate) {
        try {


            const convo = await db.Conversation.update({
                rate
            }, {
                where: {
                    id: id
                },
            });
            return convo;
        } catch (error) {
            console.error('Error deleting model:', error.message);
            throw error;
        }
    }

    /**
     * Pull a model from Ollama library
     * @param {String} modelName - Name of the model to pull
     * @returns {Promise} - Promise resolving when pull is complete
     */
    async pullModel(modelName) {
        try {
            const response = await axios.post(`${this.baseUrl}/api/pull`, {
                name: modelName,
                stream: false
            });
            return response.data;
        } catch (error) {
            console.error('Error pulling model:', error.message);
            throw error;
        }
    }

    // ... (keep the other methods from previous version)
}