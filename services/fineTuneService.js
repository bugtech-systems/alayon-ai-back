import axios from 'axios';
import { db } from '../models/index.js';
import ollama from 'ollama';
import { Op } from 'sequelize';
import { systemPrompt } from '../helpers/system-prompt.js';
import { FineTuner } from '../tuner/app/fine-tuner.js';

// Get directory name in ESM







export default class OllamaFineTuner {
    constructor(baseUrl = 'http://127.0.0.1:11434') {
        this.baseUrl = baseUrl;


    }


    async loadModels(limit = 50, offset = 0) {

        try {
            const presets = await db.AiPreset.findAll({
                order: [['created_at', 'ASC']],
                limit,
                offset,
                raw: true
            });

            console.log(presets, 'convi')

            return presets;
        } catch (error) {
            throw new Error(`Failed to load dataset: ${error.message}`);
        }
    }

    async loadDataset(conversationId, limit = 50, offset = 0) {

        console.log(conversationId, 'convi')
        try {
            const messages = await db.Conversation.findAll({
                where: {
                    title: conversationId,
                    rate: {
                        [Op.gte]: 5
                    }
                },
                order: [['created_at', 'ASC']],
                limit,
                offset,
            });


            return messages;
        } catch (error) {
            throw new Error(`Failed to load dataset: ${error.message}`);
        }
    }



    async deleteDataset() {
        try {
            const messages = await db.Message.destroy({
                where: {
                    is_training_candidate: false
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


            return messages;
        } catch (error) {
            throw new Error(`Failed to load dataset: ${error.message}`);
        }
    }

    async createModelfile(options) {
        try {

            console.log('create modelfile', options)
            const response = await ollama.create({
                model: options.model_name,
                from: options.base_model,
                parameters: options.parameters
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

    async fineTune(modelName, params = {}) {

        try {
            // 1. Verify directories
            let responses = [];
            // let dbQueryAssistant = default_models.find(a => a.model == modelName);
            let models = await this.loadModels();

            for (let model of models) {
                // const dataset = await this.loadDataset(model.model);
                // 2. Load dataset
                let parameters = { ...model.parameters, ...params }
                let messages = [];
                // console.log(model, 'MODS')
                // dataset.map(a => {
                //     messages.push({
                //         role: 'user',
                //         content: a.prompt
                //     });
                //     messages.push({
                //         role: 'assistant',
                //         content: JSON.stringify(a.metadata)
                //     });
                // })

                const newModel = await FineTuner.createFineTunedModel(model.id);



                // const query = {
                //     ...model,
                //     system: model.model == 'alayon_sequelize' ? await systemPrompt() : model.system,
                //     parameters,
                //     // messages: [...model.messages, ...messages]
                // };




                // // 3. Create modelfile
                // const modelfile = await this.createModelfile(query);

                responses.push({
                    // ...response.data,
                    system_instruction: newModel,
                    // modelfile,
                    modelName: model.name,

                    // dataset: query.messages
                })
            }


            return {
                success: true,
                data: responses,
                message: 'Fine-tune success!'
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