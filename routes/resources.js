import express from 'express';
import resourceService from '../services/ResourceApiService.js';
import { db } from '../models/index.js';
import ResourceApiService from '../services/ResourceApiService.js';

const router = express.Router();

/**
 * Standardizes the resource response format with relationships
 */
const formatResourceResponse = (resource, connection) => {
    if (!resource) return null;





    // Format relationships into grouped object
    const formattedRelationships = {};
    if (connection && resource.incoming_relationships) {
        let relate = 'incoming_relationships'
        resource[relate].forEach(relationship => {


            const relatedResource = relationship.target_resource || relationship.source_resource;
            if (relatedResource && (String(relatedResource.name).toLowerCase() == String(connection).toLowerCase())) {
                if (!formattedRelationships[relatedResource.name]) {
                    formattedRelationships[relatedResource.name] = [];
                }


                formattedRelationships[relatedResource.name].push({
                    id: relatedResource.id,
                    type: 'resource',
                    name: relatedResource.name,
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

    if (connection && resource.outgoing_relationships) {
        let relate = 'outgoing_relationships'
        resource[relate].forEach(relationship => {


            const relatedResource = relationship.target_resource || relationship.source_resource;
            if (relatedResource && (String(relatedResource.name).toLowerCase() == String(connection).toLowerCase())) {
                if (!formattedRelationships[relatedResource.name]) {
                    formattedRelationships[relatedResource.name] = [];
                }

                formattedRelationships[relatedResource.name].push({
                    id: relatedResource.id,
                    type: 'resource',
                    name: relatedResource.name,
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
        type: 'resource',
        name: resource.name,
        attributes: {
            ...resource.attributes,
            // Explicitly exclude relationships to avoid circular references
        },
        relationships: connection ? formattedRelationships : {},
        // incoming_relationships: undefined,
        // outgoing_relationships: undefined,
        meta: {
            is_deleted: resource.is_deleted,
            is_active: resource.is_active,
            created_at: resource.created_at,
            updated_at: resource.updated_at
        }
    };
};

router.post('/', async (req, res) => {
    const { relationship } = req.query;
    const transaction = await db.sequelize.transaction();
    try {
        const { name, attributes } = req.body;

        if (!name) {
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

        //Validate of resource-type exists.


        let validateResource = await ResourceApiService.validateResourceAttributes(attributes, name, transaction);

        console.log(validateResource, 'VALIDATE RESOURCE')



        const resource = await resourceService.createResource(
            { name: String(name).toLowerCase(), attributes },
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

router.get('/type/:typeId', async (req, res, next) => {
    try {
        const { relationship } = req.query;

        const resources = await resourceService.getResourcesByType(req.params.typeId);
        console.log(resources, 'resources')
        const formattedResources = resources.map(resource => formatResourceResponse(resource.dataValues, relationship));

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

router.get('/:id', async (req, res, next) => {
    try {
        const { relationship } = req.query;

        const resource = await resourceService.getResourceById(req.params.id);
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

router.get('/:id/:relationship', async (req, res, next) => {
    try {
        const { relationship } = req.params;

        const resource = await resourceService.getResourceById(req.params.id);
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
        const { name, attributes } = req.body;
        const resource = await resourceService.updateResource(
            req.params.id,
            { name, attributes },
            transaction
        );

        await transaction.commit();
        return res.status(200).json(formatResourceResponse(resource));
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