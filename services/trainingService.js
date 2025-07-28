import { db } from '../models/index.js'
import { Op } from 'sequelize';
import { generateModelfile, createModel } from './modelFileService.js';

// Base configuration for fine-tuning
const BASE_CONFIG = {
    model: 'llama3:8b',
    temperature: 0.3,
    top_k: 40,
    num_ctx: 4096
};

/**
 * Execute full fine-tuning pipeline
 * @param {string} newModelName - Name for new model version
 * @returns {Object} Training result
 */
export const executeFineTuning = async (newModelName) => {
    try {
        console.log('🏁 Starting fine-tuning pipeline');

        // 1. Retrieve high-quality training samples with labels
        const samples = await db.TrainingSample.findAll({
            where: {
                accuracyScore: { [Op.gte]: 0.85 },
                usageCount: { [Op.lt]: 3 }
            },
            include: [{
                model: db.Label,
                attributes: ['name', 'description'],
                through: { attributes: [] }
            }],
            limit: 500
        });

        if (samples.length < 100) {
            console.log('🟡 Insufficient samples for training');
            return { success: false, reason: 'Not enough qualified samples' };
        }

        console.log(`📊 Retrieved ${samples.length} training samples`);

        // 2. Generate Modelfile
        const { modelfilePath } = await generateModelfile(samples, BASE_CONFIG);

        // 3. Create new model
        await createModel(modelfilePath, newModelName);

        // 4. Update usage counts
        await db.TrainingSample.update(
            { usageCount: Sequelize.literal('usage_count + 1') },
            { where: { id: samples.map(s => s.id) } }
        );

        console.log('🎉 Fine-tuning completed successfully');
        return {
            success: true,
            modelName: newModelName,
            sampleCount: samples.length
        };
    } catch (error) {
        console.error('❌ Fine-tuning failed:', error.message);
        return { success: false, error: error.message };
    }
};


export const executeCreateModel = async (newModelName) => {
    try {
        console.log('🏁 Starting fine-tuning pipeline');

        // 1. Retrieve high-quality training samples with labels
        const model = await db.AiPreset.findOne({
            where: {
                name: newModelName
            },
            limit: 500
        });



        // 2. Generate Modelfile
        const { modelfilePath } = await generateModelfile(samples, BASE_CONFIG);

        // 3. Create new model
        await createModel(modelfilePath, newModelName);


        console.log('🎉 Fine-tuning completed successfully');
        return {
            success: true,
            modelName: newModelName,
            sampleCount: samples.length
        };
    } catch (error) {
        console.error('❌ Fine-tuning failed:', error.message);
        return { success: false, error: error.message };
    }
};


