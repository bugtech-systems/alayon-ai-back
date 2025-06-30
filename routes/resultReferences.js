import express from 'express';
import { db } from '../models/index.js';
import resultReferenceService from '../services/ResultReferenceService.js';

const router = express.Router();

/**
 * @swagger
 * /results/{executionId}:
 *   get:
 *     summary: Get execution result by ID
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Execution result data
 *       404:
 *         description: Result not found
 *       500:
 *         description: Server error
 */
router.get('/:executionId', async (req, res) => {
    try {
        const result = await db.TemplateExecutionResult.findOne({
            where: { execution_id: req.params.executionId },
            include: [
                {
                    model: db.ActionTemplate,
                    attributes: ['id', 'name', 'description']
                }
            ]
        });

        if (!result) {
            return res.status(404).json({
                error: 'Result reference not found',
                executionId: req.params.executionId
            });
        }

        // Check expiration
        if (result.expires_at && new Date(result.expires_at) < new Date()) {
            return res.status(410).json({
                error: 'Result reference has expired',
                expiredAt: result.expires_at
            });
        }

        res.json({
            execution_id: result.execution_id,
            template: result.ActionTemplate,
            results: result.results,
            expires_at: result.expires_at,
            created_at: result.created_at
        });
    } catch (error) {
        console.error(`Error fetching result ${req.params.executionId}:`, error);
        res.status(500).json({
            error: 'Failed to retrieve result',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /results/create-with-reference:
 *   post:
 *     summary: Create resource with referenced values
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resourceData:
 *                 type: object
 *               valueReferences:
 *                 type: object
 *     responses:
 *       201:
 *         description: Resource created successfully
 *       400:
 *         description: Invalid input data
 *       500:
 *         description: Server error
 */
router.post('/create-with-reference', async (req, res) => {
    try {
        const { resourceData, valueReferences } = req.body;

        if (!resourceData || typeof resourceData !== 'object') {
            throw new Error('Invalid resource data format');
        }

        // Create the base resource within transaction
        const transaction = await db.sequelize.transaction();
        try {
            const resource = await db.ResourceTag.create(resourceData, { transaction });

            // Process value references
            const values = await Promise.all(
                Object.entries(valueReferences).map(async ([field_name, reference]) => {
                    const { value, error } = await resultReferenceService.resolveReference(reference);

                    if (error) {
                        throw new Error(`Failed to resolve reference for ${field_name}: ${error}`);
                    }

                    return {
                        resource_tag_id: resource.id,
                        field_name,
                        value_reference: reference,
                        value: JSON.stringify(value),
                        raw_value: value // Store both stringified and raw values
                    };
                })
            );

            // Create resource values
            await db.ResourceValue.bulkCreate(values, { transaction });

            await transaction.commit();

            res.status(201).json({
                ...resource.toJSON(),
                resolved_values: values.map(v => ({
                    field_name: v.field_name,
                    value: v.raw_value
                }))
            });
        } catch (txError) {
            await transaction.rollback();
            throw txError;
        }
    } catch (error) {
        console.error('Error creating resource with references:', error);
        res.status(400).json({
            error: 'Failed to create resource',
            details: error.message
        });
    }
});

export default router;