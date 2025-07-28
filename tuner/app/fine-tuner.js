import { db } from '../../models/index.js';
import { Op } from 'sequelize';
import { ModelDeployer } from './model-deployer.js';
import fs from 'fs/promises';
import path from 'path';

export class FineTuner {
    /**
     * Collect high-confidence conversations for fine-tuning
     * @param {number} modelId 
     * @returns {Promise<Array>} Training examples
     */
    static async getTrainingData(modelId) {
        const model = await db.AiPreset.findByPk(modelId);
        if (!model) throw new Error('Model not found');

        const conversations = await db.Conversation.findAll({
            where: { ai_preset_id: model.id },
            include: [{
                model: db.Message,
                where: {
                    role: 'assistant',
                    confidence_score: { [Op.gte]: model.min_fine_tune_confidence },
                    is_training_candidate: true
                },
                required: false
            }]
        });

        const trainingData = [];

        for (const conversation of conversations) {
            const messages = await db.Message.findAll({
                where: { conversation_id: conversation.id },
                order: [['created_at', 'ASC']]
            });

            console.log(messages, 'MESSAGES')


            // Group into user-assistant pairs
            for (let i = 0; i < messages.length; i++) {
                if (messages[i].role === 'user' &&
                    messages[i + 1]?.role === 'assistant') {
                    trainingData.push({
                        user: messages[i].content,
                        assistant: messages[i + 1].content,
                        confidence: messages[i + 1].confidence_score
                    });
                    i++; // Skip assistant message
                }
            }
        }

        return trainingData;
    }

    /**
     * Generate fine-tuning dataset file
     * @param {Array} trainingData 
     * @param {string} modelName 
     */
    static async createTrainingFile(trainingData, modelName) {
        const dirPath = path.join('./tuner', 'fine-tune', modelName);
        await fs.mkdir(dirPath, { recursive: true });

        const filePath = path.join(dirPath, 'training.jsonl');
        const lines = [];

        for (const example of trainingData) {
            lines.push(JSON.stringify({
                messages: [
                    { role: "user", content: example.user },
                    { role: "assistant", content: example.assistant }
                ]
            }));
        }

        await fs.writeFile(filePath, lines.join('\n'));
        return filePath;
    }

    static async createTrainingMessages(trainingData) {
        const messages = [];

        for (const example of trainingData) {
            // Format user message
            messages.push(`MESSAGE user """${example.user}"""`);

            // Format assistant message
            messages.push(`MESSAGE assistant """${example.assistant}"""`);

            // Add empty line between conversation pairs
            messages.push('');
        }

        // Join with newlines and trim any extra whitespace
        return messages.join('\n').trim();
    }

    /**
     * Create fine-tuned model version
     * @param {number} modelId 
     * @returns {Promise<string>} New model name
     */
    static async createFineTunedModel(modelId) {
        const model = await db.AiPreset.findByPk(modelId);
        if (!model) throw new Error('Model not found');

        // Get training data
        const trainingData = await this.getTrainingData(modelId);
        if (trainingData.length < 1) {
            throw new Error('Insufficient training data');
        }


        // console.log(trainingData, 'TRAIN')
        // Create training file
        const trainingFile = await this.createTrainingFile(trainingData, model.name);
        const trainingMessage = await this.createTrainingMessages(trainingData);
        console.log(trainingMessage, 'TRAIN')
        // Generate new model name
        const newModelName = `${model.name}-ft-${Date.now()}`;

        // Generate Modelfile with fine-tuning instructions
        const modelfile = await this.generateFineTuneModelfile(model, trainingMessage);

        // Deploy new model
        await ModelDeployer.deployFromModelfile(newModelName, modelfile);

        // Create new model record in database
        const newModel = await db.AiPreset.create({
            ...model.get({ plain: true }),
            id: undefined,
            name: newModelName,
            base_model: model.name
        });

        return newModel;
    }

    static async generateFineTuneModelfile(model, trainingFile) {
        return `
FROM ${model.base_model}
SYSTEM """
${model.system_instruction}

## FINE-TUNED WITH REAL CONVERSATIONS
## ANTI-HALLUCINATION RULES:
1. ${model.anti_hallucination_rules}
2. ONLY use information from the context or provided options

## OUTPUT REQUIREMENTS:
1. Output STRICTLY as JSON
2. Use this EXACT schema:
${JSON.stringify(model.output_schema, null, 2)}
3. Select values ONLY from: ${JSON.stringify(model.options)}
"""

# Training parameters
PARAMETER temperature ${model.parameters.temperature}
PARAMETER num_ctx ${model.parameters.num_ctx}

# Training data
${trainingFile}
    `.trim();
    }
}