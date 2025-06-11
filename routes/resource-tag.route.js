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
router.post('/resources', createResourceTag);
router.get('/', getResourceTags);
router.get('/:type', getResourceTags);
router.post('/resources/query', queryResourceTags); // For complex querying
router.get('/resources/:id', getResourceTag);
router.put('/resources/:id', updateResourceTag);
router.delete('/resources/:id', deleteResourceTag);

// Sub-resource routes
router.get('/resources/:id/fields', getResourceTagFields);
router.get('/resources/:id/values', getResourceTagValues);
router.get('/resources/:id/relationships', getResourceTagRelationships);

export default router;