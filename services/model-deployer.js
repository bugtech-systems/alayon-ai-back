import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../models/index.js';
import { Op } from 'sequelize';
import * as expressionEvaluator from './expressionEvaluator.js';
import { resolveConfig, resolveParameters, resolvePlaceholders } from '../helpers/parameterResolver.js';
import { generateFromSchema, generateExecutionId, parseToString } from '../helpers/helpers.js';
import { DEFAULT_MODELS } from '../configs/default_models.js';
import { ActionEngine } from './ActionEngine.js';



export class ModelDeployer {
    static async generateBaseModelfile(model, trainingFile) {
        const actionEngine = new ActionEngine();


        const parameters = [
            model.parameters?.temperature !== undefined && `PARAMETER temperature ${model.parameters.temperature}`,
            model.parameters?.num_ctx !== undefined && `PARAMETER num_ctx ${model.parameters.num_ctx}`,
            model.parameters?.top_p !== undefined && `PARAMETER top_p ${model.parameters.top_p}`
        ].filter(Boolean).join('\n');


        let executionId = generateExecutionId();

        const baseContext = {
            params: {},
            outputs: {},
            executionId: executionId
        };

        if (model.pre_hooks) {
            await actionEngine.processHooks(model.pre_hooks, baseContext);
        }

        // this.context = baseContext;

        const newModel = expressionEvaluator.evaluatePlaceholders(
            resolveConfig(model, baseContext),
            baseContext
        );








        const newSystemInstruction = expressionEvaluator.evaluatePlaceholders(
            model.system_instruction,
            baseContext
        );

        console.log(newModel?.output_schema.properties, baseContext, newSystemInstruction, 'NEW MODEL')





        return `
FROM ${model.base_model}
SYSTEM """
${newSystemInstruction}

## OUTPUT CONSTRAINTS:
- Respond STRICTLY in JSON format matching the provided schema
- For missing/unknown values, return "null" (never hallucinate values)
- For enum fields, return ONLY values from the predefined options or "null"
- Never invent fields not defined in the schema

JSON SCHEMA:
${JSON.stringify(newModel?.output_schema, null, 2)}

RULES:
1. Required fields MUST always be present
2. Enum fields MUST use provided values or null
3. Unknown/missing values MUST be null
4. Never add extra fields
5. Numbers must be within defined bounds
"""

# Training parameters
${parameters}

# Training data
${trainingFile}
        `.trim();
    }

    static async generateSystemInstruction(model, message) {
        const actionEngine = new ActionEngine();


        let executionId = generateExecutionId();

        const baseContext = {
            params: {},
            outputs: {},
            executionId: executionId
        };

        if (model.pre_hooks) {
            await actionEngine.processHooks(model.pre_hooks, baseContext);
        }



        const newSystemInstruction = expressionEvaluator.evaluatePlaceholders(
            message,
            baseContext
        );

        return newSystemInstruction.trim();
    }

    static async createTrainingMessages(trainingData) {
        const messages = [];

        for (const example of trainingData) {
            if (example.context) {
                messages.push(`MESSAGE assistant """${parseToString(example.context)}"""`);
            }

            // Format user message
            messages.push(`MESSAGE user """${parseToString(example.user)}"""`);

            // Format assistant message
            messages.push(`MESSAGE assistant """${parseToString(example.assistant)}"""`);

            // Add empty line between conversation pairs
            messages.push('');
        }

        // Join with newlines and trim any extra whitespace
        return messages.join('\n').trim();
    }

    static async getTrainingData(model) {



        let options = [{ ai_preset_id: model.id, is_training_candidate: true }];





        const modelMessages = await db.Message.findAll({
            where: { [Op.and]: options },
            order: [['id', 'ASC']] // or 'DESC' for descending order
        });

        const trainingData = [];



        let defaultMess = DEFAULT_MODELS.find(a => a.name == model.name)?.messages


        let messages = [...(defaultMess ? defaultMess : []), ...modelMessages];

        if (messages.length) {


            // Group into user-assistant pairs
            for (let i = 0; i < messages.length; i++) {
                if (messages[i].role === 'user' &&
                    messages[i + 1]?.role === 'assistant') {
                    let context = (messages[i - 1]?.role == 'assistant' && messages[i - 1].name) ? messages[i - 1].content : null;
                    trainingData.push({
                        user: messages[i].content,
                        assistant: messages[i + 1].content,
                        ...(context ? { context } : {}),
                        confidence: messages[i + 1].confidence_score
                    });
                    i++; // Skip assistant message
                }
            }
        }




        return trainingData;
    }

    static async deployModel(modelId, transaction = null) {
        const options = transaction ? { transaction, raw: true } : { raw: true };
        const model = await db.AiPreset.findByPk(modelId, options);
        if (!model) throw new Error('Model not found');
        let trainingMessage = '';


        // Get training data
        let trainingData = await this.getTrainingData(model);


        if (trainingData.length > 1) {

            trainingMessage = await this.createTrainingMessages(trainingData);

            // throw new Error('Insufficient training data');
        }


        const modelfile = await this.generateBaseModelfile(model, trainingMessage);


        return this.deployFromModelfile(model.model_name, modelfile);
    }

    static async removeFromModel(modelId, transaction = null) {
        const options = transaction ? { transaction } : {};
        const model = await db.AiPreset.findByPk(modelId, options);
        if (!model) throw new Error('Model not found');

        try {
            await this.cleanupModelFiles(model.model_name);
            return await this.executeOllamaCommand('rm', model.model_name);
        } catch (error) {
            throw new Error(`Failed to remove model: ${error.message}`);
        }
    }

    static async deployFromModelfile(modelName, modelfile) {
        try {
            await this.prepareModelDirectory(modelName, modelfile);
            return await this.executeOllamaCommand('create', modelName, ['-f', path.join('./tuner', 'models', modelName, 'Modelfile')]);
        } catch (error) {
            await this.cleanupModelFiles(modelName).catch(console.error);
            throw new Error(`Failed to deploy model: ${error.message}`);
        }
    }

    // Private helper methods
    static async prepareModelDirectory(modelName, modelfile) {
        const dirPath = path.join('./tuner', 'models', modelName);
        await fs.mkdir(dirPath, { recursive: true });

        const filename = path.join(dirPath, 'Modelfile');
        await fs.writeFile(filename, modelfile);

        console.log(`Prepared model files for ${modelName} at ${filename}`);
        return filename;
    }

    static async cleanupModelFiles(modelName) {
        try {
            const dirPath = path.join('./tuner', 'models', modelName);
            await fs.rm(dirPath, { recursive: true, force: true });
            console.log(`Cleaned up model files for ${modelName}`);
        } catch (error) {
            console.error(`Error cleaning up files for ${modelName}:`, error);
            throw error;
        }
    }

    static async executeOllamaCommand(command, modelName, additionalArgs = []) {
        return new Promise((resolve, reject) => {
            const args = [command, modelName, ...additionalArgs];
            console.log(`Executing: ollama ${args.join(' ')}`);

            const ollama = spawn('ollama', args, {
                stdio: 'inherit',
                shell: true
            });

            ollama.on('error', (err) => {
                console.error(`Ollama ${command} error:`, err);
                reject(err);
            });

            ollama.on('close', (code) => {
                if (code === 0) {
                    console.log(`Successfully executed ollama ${command} for ${modelName}`);
                    resolve(`Model ${modelName} ${command === 'create' ? 'deployed' : 'removed'}`);
                } else {
                    const error = new Error(`Ollama ${command} failed with code ${code}`);
                    console.error(error.message);
                    reject(error);
                }
            });
        });
    }


}