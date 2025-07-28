import { executeFineTuning } from '../services/trainingService.js';

// Model naming convention: <base>-<version>-<timestamp>
const generateModelName = () => {
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '-');
    return `llama3-8b-ft-${timestamp}`;
};

/**
 * API Endpoint: Trigger fine-tuning job
 */
export const trainModel = async (req, res) => {
    try {
        console.log('🚂 Triggering model training');
        const modelName = generateModelName();
        const result = await executeFineTuning(modelName);

        if (result.success) {
            res.json({
                status: 'success',
                model: result.modelName,
                samples: result.sampleCount,
                message: 'Model training completed'
            });
        } else {
            res.status(400).json({
                status: 'error',
                message: result.reason || 'Training failed'
            });
        }
    } catch (error) {
        console.error('❌ Training endpoint error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Internal training error'
        });
    }
};

export const createModel = async (req, res) => {
    try {
        console.log('🚂 Triggering model training');
        const modelName = generateModelName();
        const result = await executeFineTuning(modelName);

        if (result.success) {
            res.json({
                status: 'success',
                model: result.modelName,
                samples: result.sampleCount,
                message: 'Model training completed'
            });
        } else {
            res.status(400).json({
                status: 'error',
                message: result.reason || 'Training failed'
            });
        }
    } catch (error) {
        console.error('❌ Training endpoint error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Internal training error'
        });
    }
};

/**
 * API Endpoint: Get training status
 */
export const getTrainingStatus = async (req, res) => {
    // Implementation would track active training jobs
    res.json({
        status: 'idle',
        lastTrained: '2024-07-20T14:30:00Z',
        nextScheduled: '2024-07-21T02:00:00Z'
    });
};