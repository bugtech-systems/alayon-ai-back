const express = require('express');
const router = express.Router();
const Touchpoint = require('../models/touchpoint.model');

router.get('/', async (req, res) => {
    const data = await Touchpoint.find().populate('resourceId');
    res.json(data);
});

router.get('/:id', async (req, res) => {
    const data = await Touchpoint.findById(req.params.id).populate('resourceId');
    res.json(data);
});

router.post('/', async (req, res) => {
    const created = await Touchpoint.create(req.body);
    res.status(201).json(created);
});

router.put('/:id', async (req, res) => {
    const updated = await Touchpoint.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
});

router.delete('/:id', async (req, res) => {
    const deleted = await Touchpoint.findByIdAndDelete(req.params.id);
    res.json(deleted);
});

module.exports = router;
