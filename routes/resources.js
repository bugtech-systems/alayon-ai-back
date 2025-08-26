import express from 'express';
import resourceService from '../services/ResourceApiService.js';
import { db } from '../models/index.js';

const router = express.Router();

/**
 * Standardizes the resource response format with relationships
 */
const formatResourceResponse = (resource, connection) => {
    if (!resource) return null;

    // Format relationships into grouped object
    const formattedRelationships = {};
    if (connection && resource.incoming_relationships) {
        let relate = 'incoming_relationships';
        resource[relate].forEach(relationship => {
            const relatedResource = relationship.target_resource || relationship.source_resource;
            if (relatedResource && (String(relatedResource.resource_name).toLowerCase() == String(connection).toLowerCase())) {
                if (!formattedRelationships[relatedResource.resource_name]) {
                    formattedRelationships[relatedResource.resource_name] = [];
                }

                formattedRelationships[relatedResource.resource_name].push({
                    id: relatedResource.id,
                    position: relatedResource.position,
                    resource_type: 'resource',
                    resource_name: relatedResource.resource_name,
                    attributes: { ...relatedResource.attributes },
                    is_deleted: relatedResource.is_deleted,
                    is_active: relatedResource.is_active,
                    created_at: relatedResource.created_at,
                    updated_at: relatedResource.updated_at,
                    // Include relationship-specific attributes if needed
                    relationship_attributes: {
                        created_at: relationship.created_at,
                        updated_at: relationship.updated_at,
                        ...relationship.attributes
                    }
                });
            }
        });
    }

    if (connection && resource.outgoing_relationships) {
        let relate = 'outgoing_relationships';
        resource[relate].forEach(relationship => {
            const relatedResource = relationship.target_resource || relationship.source_resource;
            if (relatedResource && (String(relatedResource.resource_name).toLowerCase() == String(connection).toLowerCase())) {
                if (!formattedRelationships[relatedResource.resource_name]) {
                    formattedRelationships[relatedResource.resource_name] = [];
                }

                formattedRelationships[relatedResource.resource_name].push({
                    id: relatedResource.id,
                    resource_type: 'resource',
                    position: relatedResource.position,
                    resource_name: relatedResource.resource_name,
                    attributes: { ...relatedResource.attributes },
                    is_deleted: relatedResource.is_deleted,
                    is_active: relatedResource.is_active,
                    created_at: relatedResource.created_at,
                    updated_at: relatedResource.updated_at,
                    // Include relationship-specific attributes if needed
                    relationship_attributes: {
                        created_at: relationship.created_at,
                        updated_at: relationship.updated_at
                    }
                });
            }
        });
    }

    return {
        id: resource.id,
        resource_type: 'resource',
        resource_name: resource.resource_name,
        tenant_id: resource.tenant_id,
        position: resource.position,
        attributes: {
            ...resource.attributes,
        },
        relationships: connection ? formattedRelationships : {},
        meta: {
            is_deleted: resource.is_deleted,
            is_active: resource.is_active,
            created_at: resource.created_at,
            updated_at: resource.updated_at
        }
    };
};

// Middleware to ensure tenant_id is available
// router.use((req, res, next) => {
//     if (!req.tenantId) {
//         return res.status(400).json({
//             error: {
//                 status: 400,
//                 message: 'Tenant ID is required'
//             }
//         });
//     }
//     next();
// });

router.post('/', async (req, res) => {
    const { relationship } = req.query;
    const transaction = await db.sequelize.transaction();
    try {
        const { resource_name, attributes, relationships, resource_parent_id } = req.body;

        if (!resource_name) {
            await transaction.rollback();
            return res.status(400).json({
                error: {
                    status: 400,
                    message: 'Resource name is required'
                }
            });
        }

        if (!attributes || typeof attributes !== 'object') {
            await transaction.rollback();
            return res.status(400).json({
                error: {
                    status: 400,
                    message: 'Attributes object is required'
                }
            });
        }

        const resource = await resourceService.createResource(
            {
                resource_name: String(resource_name).toLowerCase(),
                attributes,
                relationships,
                tenant_id: req.tenantId,
                resource_parent_id
            },
            transaction
        );

        await transaction.commit();
        return res.status(201).json(formatResourceResponse(resource, relationship));
    } catch (error) {
        await transaction.rollback();

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: {
                    status: 400,
                    message: 'Attribute validation failed',
                    details: error.details
                }
            });
        }

        if (error.name === 'DuplicateError') {
            return res.status(409).json({
                error: {
                    status: 409,
                    message: 'Duplicate values in unique fields',
                    details: error.details
                }
            });
        }

        console.error('Resource creation error:', error);
        return res.status(500).json({
            error: {
                status: 500,
                message: 'Internal server error',
                ...(process.env.NODE_ENV === 'development' && {
                    details: error.message,
                    stack: error.stack
                })
            }
        });
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const { relationship } = req.query;
        const resource = await resourceService.getResourceById(req.params.id, req.tenantId);
        if (!resource) {
            return res.status(404).json({
                error: {
                    status: 404,
                    message: 'Resource not found'
                }
            });
        }
        return res.status(200).json(formatResourceResponse(resource, relationship));
    } catch (error) {
        next(error);
    }
});

router.get('/type/:typeId', async (req, res, next) => {
    try {

        const resources = await resourceService.getResourcesByType(req.params.typeId, req.tenantId);
        const formattedResources = resources.map(resource => formatResourceResponse(resource.dataValues));

        return res.status(200).json({
            data: formattedResources,
            meta: {
                count: formattedResources.length
            }
        });
    } catch (error) {
        next(error);
    }
});

router.get('/type/:typeId/:relationship', async (req, res, next) => {
    try {
        const resources = await resourceService.getResourcesByType(req.params.typeId, req.tenantId);
        const formattedResources = resources.map(resource => formatResourceResponse(resource.dataValues, req.params.relationship));

        return res.status(200).json({
            data: formattedResources,
            meta: {
                count: formattedResources.length
            }
        });
    } catch (error) {
        next(error);
    }
});

router.get('/:id/:relationship', async (req, res, next) => {
    try {
        const { relationship } = req.params;

        const resource = await resourceService.getResourceById(req.params.id, req.tenantId);
        if (!resource) {
            return res.status(404).json({
                error: {
                    status: 404,
                    message: 'Resource not found'
                }
            });
        }
        return res.status(200).json(formatResourceResponse(resource, relationship));
    } catch (error) {
        next(error);
    }
});

router.put('/:id', async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { name, attributes, position } = req.body;

        const resource = await resourceService.getResourceById(req.params.id, req.tenantId);


        if (!resource) {
            return res.status(404).json({
                error: {
                    status: 404,
                    message: 'Resource not Found!'
                }
            });
        }




        const updateResource = await resourceService.updateResource(
            req.params.id,
            {
                resource_name: resource.resource_name,
                attributes: { ...resource.attributes, ...attributes },
                position,
                tenant_id: req.tenantId
            },
            transaction
        );

        await transaction.commit();
        return res.status(200).json(formatResourceResponse(updateResource));
    } catch (error) {
        await transaction.rollback();

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                error: {
                    status: 400,
                    message: 'Attribute validation failed',
                    details: error.details
                }
            });
        }

        if (error.name === 'ConflictError') {
            return res.status(409).json({
                error: {
                    status: 409,
                    message: error.message,
                    details: error.details
                }
            });
        }

        if (error.message === 'Resource not found') {
            return res.status(404).json({
                error: {
                    status: 404,
                    message: error.message
                }
            });
        }

        console.error('Update error:', error);
        return res.status(500).json({
            error: {
                status: 500,
                message: 'Internal server error',
                ...(process.env.NODE_ENV === 'development' && {
                    details: error.message,
                    stack: error.stack
                })
            }
        });
    }
});

router.delete('/:id', async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { resource, is_deleted } = await resourceService.toggleDeleteResource(
            req.params.id,
            req.tenantId,
            transaction
        );

        await transaction.commit();
        return res.status(200).json({
            data: {
                message: `Resource ${is_deleted ? 'deleted' : 'restored'} successfully`,
                is_deleted,
                resource: formatResourceResponse(resource).data
            }
        });
    } catch (error) {
        await transaction.rollback();

        if (error.message === 'Resource not found') {
            return res.status(404).json({
                error: {
                    status: 404,
                    message: error.message
                }
            });
        }

        console.error('Delete error:', error);
        return res.status(500).json({
            error: {
                status: 500,
                message: 'Internal server error',
                ...(process.env.NODE_ENV === 'development' && {
                    details: error.message,
                    stack: error.stack
                })
            }
        });
    }
});

export default router;