import express from 'express'
import { Touchpoint } from '../models/touchpoint.model.js'

const router = express.Router()

// Get all touchpoints
router.get('/', async (req, res) => {
    try {
        const data = await Touchpoint.find().populate('resourceId')
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// Get a single touchpoint by ID
router.get('/:id', async (req, res) => {
    try {
        const data = await Touchpoint.findById(req.params.id).populate('resourceId')
        res.json(data)
    } catch (err) {
        res.status(404).json({ error: 'Touchpoint not found' })
    }
})

// Create a new touchpoint
router.post('/', async (req, res) => {
    try {
        const created = await Touchpoint.create(req.body)
        res.status(201).json(created)
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

// Update a touchpoint
router.put('/:id', async (req, res) => {
    try {
        const updated = await Touchpoint.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
        })
        res.json(updated)
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

// Delete a touchpoint
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await Touchpoint.findByIdAndDelete(req.params.id)
        res.json(deleted)
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

export default router