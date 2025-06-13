import express from "express";
import {
    getResourceConfig,
    upsertResourceConfigFields,
    updateResourceConfigById
} from "../controllers/resourceConfigController.js";

const router = express.Router();

/**
 * @swagger
 * /:type:
 *   get:
 *     summary: Get Resource Config
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: Configurations
 */
router.get("/:type", getResourceConfig);

/**
 * @swagger
 * /resource-config:
 *   post:
 *     summary: Upsert Resource Configuration Fields
 *     tags: [Config]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Employee"
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                 example: [{ "key": "department", "label": "Department" }]
 *     responses:
 *       200:
 *         description: Successfully upserted resource config
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Internal server error
 */
router.post("/", upsertResourceConfigFields);


/**
 * @swagger
 * /resource-config/{id}:
 *   put:
 *     summary: Update Resource Config Fields by ID
 *     tags: [Config]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the resource config to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fields
 *             properties:
 *               fields:
 *                 type: array
 *                 description: Updated config fields
 *                 items:
 *                   type: object
 *                 example: [{ "key": "status", "label": "Status" }]
 *     responses:
 *       200:
 *         description: Successfully updated resource config
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 config:
 *                   type: object
 *       400:
 *         description: Bad request - fields must be an array
 *       404:
 *         description: Resource config not found
 *       500:
 *         description: Server error
 */
router.put("/:id", updateResourceConfigById); // PUT /resource-config/:id

export default router;
