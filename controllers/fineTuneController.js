import FineTuneService from '../services/fineTuneService.js';


const tuner = new FineTuneService();

export default {
    listDatasets: async (req, res) => {
        try {
            const datasets = await tuner.loadDataset();
            res.json({ datasets });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    deleteDatasets: async (req, res) => {
        try {
            const datasets = await tuner.deleteDataset();
            res.json({ datasets });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },
    getConversations: async (req, res) => {
        try {
            const conversations = await tuner.loadConversations();
            res.json({ conversations });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    startFineTuning: async (req, res) => {
        try {
            const { modelName, parameters = {} } = req.body;

            if (!modelName) {
                return res.status(400).json({
                    error: 'modelName and dataset are required',
                    example: {
                        modelName: "my-custom-model",
                        baseModel: "mistral:latest",
                        dataset: "geography",
                        parameters: {
                            num_ctx: "4096",
                            temperature: "0.7"
                        }
                    }
                });
            }

            const result = await tuner.fineTune(modelName, parameters);

            res.json({
                success: true,
                modelName,
                status: 'started',
                result
            });
        } catch (error) {
            console.log(error, 'ERRRR')
            res.status(500).json({ error: error.message });
        }
    },

    listModels: async (req, res) => {
        try {
            const models = await tuner.listModels();
            res.json({ models });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    getModel: async (req, res) => {
        try {
            const { modelName } = req.params;
            const models = await tuner.listModels();
            const model = models.find(m => m.name === modelName);

            if (!model) {
                return res.status(404).json({ error: 'Model not found' });
            }

            res.json({ model });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    deleteModel: async (req, res) => {
        try {
            const { modelName } = req.params;
            const result = await tuner.deleteModel(modelName);
            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    checkJobStatus: async (req, res) => {
        try {
            // In a real implementation, you would track job status
            // This is a simplified version
            res.json({
                jobId: req.params.jobId,
                status: 'completed', // or 'in-progress', 'failed'
                progress: 100,
                modelName: 'example-model'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    rateConversation: async (req, res) => {
        try {
            // In a real implementation, you would track job status
            // This is a simplified version
            let { conversationId, rate } = req.params;

            let convo = await tuner.rateConvo(conversationId, rate);
            res.json({
                status: 'completed', // or 'in-progress', 'failed'
                progress: 100,
                updated_count: convo.length
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};