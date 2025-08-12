import express from 'express';
import { ValidationError } from 'sequelize';
import { db } from '../models/index.js';
import { ModelDeployer } from '../services/model-deployer.js';

const router = express.Router();

// Helper function to handle transaction rollback on errors
const withTransaction = async (operation, res) => {
    const t = await db.sequelize.transaction();
    try {
        const result = await operation(t);
        await t.commit();
        return result;
    } catch (error) {
        await t.rollback();

        if (error instanceof ValidationError) {
            return res.status(400).json({
                error: 'Validation error',
                details: error.errors.map(e => e.message)
            });
        }

        console.error('Transaction error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};

// Create - POST /presets
router.post('/', async (req, res) => {
    await withTransaction(async (t) => {
        const preset = await db.AiPreset.create(req.body, { transaction: t });
        await ModelDeployer.deployModel(preset.id, t);
        res.status(201).json(preset);
    }, res);
});

// Read All - GET /presets
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const result = await db.AiPreset.findAndCountAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            where: req.query.filters ? JSON.parse(req.query.filters) : {}
        });

        res.json({
            data: result.rows,
            meta: {
                total: result.count,
                page: parseInt(page),
                totalPages: Math.ceil(result.count / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching presets:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Read Single - GET /presets/:id
router.get('/:id', async (req, res) => {
    try {
        const preset = await db.AiPreset.findByPk(req.params.id);
        if (!preset) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        res.json(preset);
    } catch (error) {
        console.error('Error fetching preset:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Update - PUT /presets/:id
router.put('/:id', async (req, res) => {
    await withTransaction(async (t) => {
        const [affectedRows] = await db.AiPreset.update(req.body, {
            where: { id: req.params.id },
            individualHooks: true,
            transaction: t
        });

        if (affectedRows === 0) {
            return res.status(404).json({ error: 'Preset not found' });
        }

        const updatedPreset = await db.AiPreset.findByPk(req.params.id, { transaction: t });
        await ModelDeployer.deployModel(updatedPreset.id, t);

        res.json(updatedPreset);
    }, res);
});

// Delete - DELETE /presets/:id
router.delete('/:id', async (req, res) => {
    await withTransaction(async (t) => {
        await ModelDeployer.removeFromModel(req.params.id, t);

        const deleted = await db.AiPreset.destroy({
            where: { id: req.params.id },
            transaction: t
        });

        if (!deleted) {
            return res.status(404).json({ error: 'Preset not found' });
        }

        res.status(200).json({ message: 'Preset Deleted!' });
    }, res);
});

// Deploy - POST /presets/deploy/:id
router.post('/deploy/:id', async (req, res) => {
    await withTransaction(async (t) => {
        const model = await db.AiPreset.findByPk(req.params.id, { transaction: t });

        if (!model) {
            return res.status(404).json({ error: 'Preset not found' });
        }

        console.log(`[DEPLOY] Starting deployment for: ${model.name}`);
        await ModelDeployer.deployModel(model.id, t);
        console.log(`[DEPLOY] ✓ Successfully deployed: ${model.name}`);

        res.status(200).json({
            message: `Model ${model.name} deployed successfully`,
            model: {
                id: model.id,
                name: model.name,
                base_model: model.base_model
            }
        });
    }, res);
});

export default router;