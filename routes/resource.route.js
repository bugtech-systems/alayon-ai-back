const express = require('express');
const router = express.Router();
const ResourceTag = require('../models/resourceTag.model');

router.get('/', async (req, res) => {
    const data = await ResourceTag.find();
    res.json(data);
});

router.get('/type/:type', async (req, res) => {
    const data = await ResourceTag.find({ resourceType: req.params.type });
    res.json(data);
});

router.get('/:id', async (req, res) => {
    const data = await ResourceTag.findById(req.params.id);
    res.json(data);
});

router.post('/', async (req, res) => {
    const created = await ResourceTag.create(req.body);
    res.status(201).json(created);
});

router.put('/:id', async (req, res) => {
    const updated = await ResourceTag.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
});

router.delete('/:id', async (req, res) => {
    const deleted = await ResourceTag.findByIdAndDelete(req.params.id);
    res.json(deleted);
});

module.exports = router;
