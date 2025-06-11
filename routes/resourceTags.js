// routes/resourceRoutes.js
import express from 'express';
import {
    getResourceWithRelationships,
    createResource,
    updateResource,
    deleteResource,
    listResources
} from '../controllers/resourceTagController.js';

const router = express.Router();

// List all resources
router.get('/', listResources);

// Create a new resource
router.post('/', createResource);

// Get a single resource with populated fields & relationships
router.get('/:id', getResourceWithRelationships);

// Update a resource
router.put('/:id', updateResource);

// Delete a resource
router.delete('/:id', deleteResource);

export default router;
