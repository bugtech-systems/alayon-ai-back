// 📁 routes/resourceTagRoutes.js
import express from 'express';
import {
    createResourceTag,
    getResourceTags,
    getResourceTag,
    updateResourceTag,
    deleteResourceTag,
    getResourceTagFields,
    getResourceTagValues,
    getResourceTagRelationships,
    queryResourceTags
} from '../controllers/resource-tagController.js';

const router = express.Router();

// Standard CRUD routes
/**
 * @swagger
 * /resources:
 *   post:
 *     summary: Create a new ResourceTag
 *     tags: [ResourceTag]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResourceTag'
 *     responses:
 *       201:
 *         description: ResourceTag created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResourceTag'
 */
router.post('/resources', createResourceTag);

/**
 * @swagger
 * /:
 *   get:
 *     summary: Get all ResourceTags
 *     tags: [ResourceTag]
 *     responses:
 *       200:
 *         description: List of all ResourceTags
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resources:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ResourceTag'
 */
router.get('/', getResourceTags);

/**
 * @swagger
 * /{type}:
 *   get:
 *     summary: Get ResourceTags by type
 *     tags: [ResourceTag]
 *     parameters:
 *       - in: path
 *         name: type
 *         schema:
 *           type: string
 *         required: true
 *         description: ResourceTag type to filter
 *     responses:
 *       200:
 *         description: Filtered ResourceTags
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ResourceTag'
 */
router.get('/:type', getResourceTags);

/**
 * @swagger
 * /resources/query:
 *   post:
 *     summary: Query ResourceTags with custom filters
 *     tags: [ResourceTag]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Queried ResourceTags
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ResourceTag'
 */
router.post('/resources/query', queryResourceTags);

/**
 * @swagger
 * /resources/{id}:
 *   get:
 *     summary: Get a single ResourceTag with populated relationships and values
 *     tags: [ResourceTag]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ResourceTag ID
 *     responses:
 *       200:
 *         description: Full ResourceTag data with relationships
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResourceTag'
 *       404:
 *         description: ResourceTag not found
 */
router.get('/resources/:id', getResourceTag);

/**
 * @swagger
 * /resources/{id}:
 *   put:
 *     summary: Update a ResourceTag
 *     tags: [ResourceTag]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ResourceTag ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResourceTag'
 *     responses:
 *       200:
 *         description: Updated ResourceTag
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResourceTag'
 *       404:
 *         description: Resource not found
 */
router.put('/resources/:id', updateResourceTag);

/**
 * @swagger
 * /resources/{id}:
 *   delete:
 *     summary: Delete a ResourceTag by ID
 *     tags: [ResourceTag]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ResourceTag ID
 *     responses:
 *       200:
 *         description: ResourceTag deleted successfully
 *       404:
 *         description: Resource not found
 */
router.delete('/resources/:id', deleteResourceTag);

/**
 * @swagger
 * /resources/{id}/fields:
 *   get:
 *     summary: Get fields of a specific ResourceTag
 *     tags: [ResourceTag]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ResourceTag ID
 *     responses:
 *       200:
 *         description: List of fields
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Field'
 */
router.get('/resources/:id/fields', getResourceTagFields);

/**
 * @swagger
 * /resources/{id}/values:
 *   get:
 *     summary: Get values of a specific ResourceTag
 *     tags: [ResourceTag]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ResourceTag ID
 *     responses:
 *       200:
 *         description: List of values
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Value'
 */
router.get('/resources/:id/values', getResourceTagValues);

/**
 * @swagger
 * /resources/{id}/relationships:
 *   get:
 *     summary: Get all relationships of a specific ResourceTag
 *     description: |
 *       Retrieves all defined relationships associated with the specified ResourceTag.
 *       Relationships include type, referenced resource type, and reference ID.
 *     tags: [ResourceTag]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the ResourceTag
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of relationships for the specified resource
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 relationships:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         example: "connected_to"
 *                       refType:
 *                         type: string
 *                         example: "ResourceTag"
 *                       refId:
 *                         type: string
 *                         example: "664f1623568b7bc7f89fbd7d"
 *       404:
 *         description: Resource not found
 *       500:
 *         description: Internal server error
 */

router.get('/resources/:id/relationships', getResourceTagRelationships);


export default router;