import express from 'express';
import {
    createResource,
    getResourcesByType,
    getResourceWithRelationships,
    updateResource,
    deleteResource
} from '../controllers/resourceTagController.js';

const router = express.Router();

router.post('/', createResource);
router.get('/:resourceType', getResourcesByType);
router.get('/detail/:id', getResourceWithRelationships);
router.put('/:id', updateResource);
router.delete('/:id', deleteResource);

export default router;
