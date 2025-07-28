import express from 'express';
import { db, initializeDatabase } from '../../models/index.js';
import { ModelDeployer } from './model-deployer.js';
import { FineTuner } from './fine-tuner.js';
import { AIAgent } from './ai-agent.js';

const app = express();
app.use(express.json());

// Initialize database connection
const syncDatabase = async () => {
    console.log('[DATABASE] Initializing database connection...');
    try {
        const initializedDb = await initializeDatabase();
        console.log('[DATABASE] ✓ Connection established successfully');
        return initializedDb;
    } catch (error) {
        console.error('[DATABASE] ✗ Connection failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
};

syncDatabase().then(() => {
    console.log('[SYSTEM] Database initialization complete');
}).catch(err => {
    console.error('[SYSTEM] Critical database error:', err);
});

function generateId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

// Model Management Endpoints
app.post('/models', async (req, res) => {
    console.log('[MODEL] Received model creation request');
    console.debug('Request body:', JSON.stringify(req.body, null, 2));

    try {
        const model = await db.AiPreset.create(req.body);
        console.log(`[MODEL] Created new model: ${model.name} (ID: ${model.id})`);
        res.status(201).json(model);
    } catch (error) {
        console.error('[MODEL] Creation failed:', error.message);
        console.error('Validation errors:', error.errors?.map(e => e.message).join(', '));
        res.status(400).json({
            error: 'Model creation failed',
            details: error.message,
            validationErrors: error.errors?.map(e => e.message)
        });
    }
});

app.post('/models/:id/deploy', async (req, res) => {
    const modelId = req.params.id;
    console.log(`[DEPLOY] Deployment requested for model ID: ${modelId}`);

    try {
        const model = await db.AiPreset.findByPk(modelId);
        if (!model) {
            console.error(`[DEPLOY] Model not found: ${modelId}`);
            return res.status(404).json({ error: `Model ${modelId} not found` });
        }

        console.log(`[DEPLOY] Starting deployment for: ${model.name}`);
        await ModelDeployer.deployModel(model.id);

        console.log(`[DEPLOY] ✓ Successfully deployed: ${model.name}`);
        res.json({
            message: `Model ${model.name} deployed successfully`,
            model: {
                id: model.id,
                name: model.name,
                base_model: model.base_model
            }
        });
    } catch (error) {
        console.error('[DEPLOY] Deployment failed:', error.message);
        console.error('Error details:', error.stack);
        res.status(500).json({
            error: 'Deployment failed',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.post('/models/:id/fine-tune', async (req, res) => {
    const modelId = req.params.id;
    console.log(`[FINE-TUNE] Fine-tuning requested for model ID: ${modelId}`);

    try {
        console.log('[FINE-TUNE] Checking for sufficient training data...');
        const newModel = await FineTuner.createFineTunedModel(modelId);

        console.log(`[FINE-TUNE] ✓ Created fine-tuned model: ${newModel.name}`);
        res.status(201).json({
            message: 'Fine-tuning completed successfully',
            model: newModel
        });
    } catch (error) {
        console.error('[FINE-TUNE] Fine-tuning failed:', error.message);

        if (error.message.includes('Insufficient training data')) {
            console.warn('[FINE-TUNE] Insufficient high-confidence examples');
            res.status(422).json({
                error: 'Fine-tuning requires at least 10 high-confidence examples',
                details: error.message
            });
        } else {
            console.error('[FINE-TUNE] Critical error:', error.stack);
            res.status(500).json({
                error: 'Fine-tuning process failed',
                details: error.message
            });
        }
    }
});

app.get('/models', async (req, res) => {
    console.log('[MODEL] Fetching all models');
    try {
        const models = await db.AiPreset.findAll();
        console.log(`[MODEL] Found ${models.length} models`);
        res.json(models);
    } catch (error) {
        console.error('[MODEL] Fetch failed:', error.message);
        res.status(500).json({
            error: 'Failed to fetch models',
            details: error.message
        });
    }
});

// Conversation Endpoints
app.post('/sessions', async (req, res) => {
    console.log('[SESSION] New session request');
    console.debug('Request body:', req.body);

    try {
        const { modelId } = req.body;
        if (!modelId) {
            console.error('[SESSION] Missing modelId');
            return res.status(400).json({ error: 'modelId required' });
        }

        console.log(`[SESSION] Creating session for model ID: ${modelId}`);
        const session = await db.Conversation.create({
            ai_preset_id: modelId,
            session_id: generateId()
        });

        console.log(`[SESSION] ✓ Created session ID: ${session.id}`);
        res.status(201).json(session);
    } catch (error) {
        console.error('[SESSION] Creation failed:', error.message);
        res.status(500).json({
            error: 'Session creation failed',
            details: error.message
        });
    }
});

app.post('/sessions/:sessionId/messages', async (req, res) => {
    const sessionId = req.params.sessionId;
    console.log(`[MESSAGE] New message for session: ${sessionId}`);
    console.debug('Message content:', req.body.content);

    try {
        const session = await db.Conversation.findByPk(sessionId);
        if (!session) {
            console.error(`[MESSAGE] Session not found: ${sessionId}`);
            return res.status(404).json({ error: 'Session not found' });
        }

        console.log(`[MESSAGE] Initializing agent for model: ${session.ai_preset_id}`);
        const agent = new AIAgent(session.ai_preset_id, session.id);
        await agent.initialize();

        console.log('[MESSAGE] Processing user input...');
        const response = await agent.generate(req.body.content);

        console.log('[MESSAGE] ✓ Response generated successfully');
        console.debug('Response:', JSON.stringify(response, null, 2));
        res.json(response);
    } catch (error) {
        console.error('[MESSAGE] Processing failed:', error.message);

        if (error.message.includes('Response validation failed')) {
            console.error('[MESSAGE] Invalid response format:', error.stack);
            res.status(422).json({
                error: 'Response validation failed',
                details: error.message
            });
        } else {
            console.error('[MESSAGE] Critical error:', error.stack);
            res.status(500).json({
                error: 'Message processing failed',
                details: error.message
            });
        }
    }
});

app.get('/sessions/:sessionId/messages', async (req, res) => {
    const sessionId = req.params.sessionId;
    console.log(`[MESSAGE] Fetching messages for session: ${sessionId}`);

    try {
        const messages = await db.Message.findAll({
            where: { conversation_id: sessionId },
            order: [['createdAt', 'ASC']]
        });

        console.log(`[MESSAGE] Found ${messages.length} messages`);
        res.json(messages);
    } catch (error) {
        console.error('[MESSAGE] Fetch failed:', error.message);
        res.status(500).json({
            error: 'Failed to fetch messages',
            details: error.message
        });
    }
});


app.get('/sessions', async (req, res) => {
    const sessionId = req.params.sessionId;
    console.log(`[MESSAGE] Fetching messages for session: ${sessionId}`);

    try {
        const messages = await db.Conversation.findAll({
            // where: { conversation_id: sessionId },
            order: [['created_at', 'ASC']]
        });

        console.log(`[Converstions] Found ${messages.length} messages`);
        res.json(messages);
    } catch (error) {
        console.error('[MESSAGE] Fetch failed:', error.message);
        res.status(500).json({
            error: 'Failed to fetch messages',
            details: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[SYSTEM] Unhandled error:', err.message);
    console.error('Error stack:', err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
    console.log(`[SYSTEM] Server running on port ${PORT}`);
    console.log(`[SYSTEM] Environment: ${process.env.NODE_ENV || 'development'}`);
});