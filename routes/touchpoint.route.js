import express from "express";
import { Touchpoint } from "../models/touchpoint.model.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Touchpoint
 *   description: API endpoints for managing Touchpoints
 */

/**
 * @swagger
 * /touchpoints:
 *   get:
 *     summary: Get all touchpoints
 *     tags: [Touchpoint]
 *     responses:
 *       200:
 *         description: List of touchpoints
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Touchpoint'
 *       500:
 *         description: Server error
 */
router.get("/", async (req, res) => {
  try {
    const touchpoints = await Touchpoint.find().populate("resourceId");
    res.status(200).json(touchpoints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /touchpoints/{id}:
 *   get:
 *     summary: Get a single touchpoint by ID
 *     tags: [Touchpoint]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Touchpoint ID
 *     responses:
 *       200:
 *         description: Touchpoint found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Touchpoint'
 *       404:
 *         description: Touchpoint not found
 */
router.get("/:id", async (req, res) => {
  try {
    const touchpoint = await Touchpoint.findById(req.params.id).populate(
      "resourceId"
    );
    if (!touchpoint)
      return res.status(404).json({ error: "Touchpoint not found" });
    res.status(200).json(touchpoint);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * @swagger
 * /touchpoints:
 *   post:
 *     summary: Create a new touchpoint
 *     tags: [Touchpoint]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TouchpointInput'
 *     responses:
 *       201:
 *         description: Touchpoint created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Touchpoint'
 *       400:
 *         description: Validation or creation error
 */
router.post("/", async (req, res) => {
  try {
    const newTouchpoint = await Touchpoint.create(req.body);
    res.status(201).json(newTouchpoint);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /touchpoints/{id}:
 *   put:
 *     summary: Update an existing touchpoint
 *     tags: [Touchpoint]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Touchpoint ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TouchpointInput'
 *     responses:
 *       200:
 *         description: Touchpoint updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Touchpoint'
 *       400:
 *         description: Update error
 */
router.put("/:id", async (req, res) => {
  try {
    const updated = await Touchpoint.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
      }
    );
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /touchpoints/{id}:
 *   delete:
 *     summary: Delete a touchpoint by ID
 *     tags: [Touchpoint]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Touchpoint ID
 *     responses:
 *       200:
 *         description: Touchpoint deleted
 *       400:
 *         description: Deletion error
 */
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Touchpoint.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ error: "Touchpoint not found" });
    res.status(200).json(deleted);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
