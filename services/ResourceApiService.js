import { db } from '../models/index.js';
import { Sequelize, where } from 'sequelize';

class ResourceService {
    constructor() {
        this.ResourceTag = db.ResourceTag;
        this.ResourceField = db.ResourceField;
        this.ResourceRelationship = db.ResourceRelationship;
        this.ResourceValue = db.ResourceValue;
        this.sequelize = db.sequelize;
        this.db = db;
        this.Op = Sequelize.Op;
    }

    async validateResourceAttributes(attributes, resourceName, tenantId, transaction) {
        // Find parent config resource with tenant_id
        const parentResourceData = await this.ResourceTag.findOne({
            where: {
                [this.Op.and]: [
                    Sequelize.where(
                        Sequelize.fn('lower', Sequelize.col('resource_name')),
                        Sequelize.fn('lower', resourceName)
                    ),
                    { resource_type: 'config', is_deleted: false, ...(tenantId ? { tenant_id: tenantId } : {}) }
                ]
            },
            include: [{
                model: this.ResourceField,
                as: 'fields',
                attributes: ['field_name', 'data_type', 'is_required', 'is_unique'],
                required: false
            }],
            transaction
        });

        if (!parentResourceData) {
            throw new Error(`Parent config resource not found for name: ${resourceName}`);
        }

        const parentResource = parentResourceData.get({ plain: true });

        // Build field definitions map
        const fieldDefinitions = parentResource.fields.reduce((acc, field) => {
            acc[field.field_name] = {
                type: field.data_type,
                isRequired: field.is_required,
                isUnique: field.is_unique
            };
            return acc;
        }, {});

        const validationErrors = [];

        // Check for missing required fields
        const missingRequiredFields = Object.entries(fieldDefinitions)
            .filter(([_, def]) => def.isRequired)
            .filter(([fieldName]) => attributes[fieldName] === undefined)
            .map(([fieldName]) => fieldName);
        if (missingRequiredFields.length > 0) {
            validationErrors.push({
                type: 'MISSING_REQUIRED_FIELDS',
                message: 'Required fields not provided',
                details: { missingRequiredFields }
            });
        }

        // Validate field types
        for (const [fieldName, value] of Object.entries(attributes)) {
            const fieldDef = fieldDefinitions[fieldName];
            if (!fieldDef) continue;

            let isValid = true;
            switch (fieldDef.type) {
                case 'string':
                    isValid = typeof value === 'string';
                    break;
                case 'number':
                    isValid = typeof Number(value) === 'number' && !isNaN(value);
                    break;
                case 'boolean':
                    isValid = typeof value === 'boolean';
                    break;
                case 'array':
                    isValid = Array.isArray(value);
                    break;
                case 'object':
                    isValid = typeof value === 'object' && !Array.isArray(value) && value !== null;
                    break;
            }

            if (!isValid) {
                validationErrors.push({
                    type: 'TYPE_MISMATCH',
                    message: `Field '${fieldName}' has invalid type`,
                    details: {
                        field: fieldName,
                        expectedType: fieldDef.type,
                        actualValue: value
                    }
                });
            }
        }

        if (validationErrors.length > 0) {
            throw {
                name: 'ValidationError',
                details: validationErrors[0].details,
                message: `${validationErrors[0].message}: ${JSON.stringify(validationErrors[0].details)}`
            };
        }

        // Check for duplicate values in unique fields
        const uniqueFields = Object.entries(fieldDefinitions)
            .filter(([_, def]) => def.isUnique)
            .map(([fieldName]) => fieldName);

        if (uniqueFields.length > 0) {
            const duplicateChecks = await Promise.all(
                uniqueFields.map(fieldName =>
                    this.ResourceTag.findOne({
                        where: {
                            resource_parent_id: parentResource.id,
                            // ...(tenantId ? { tenant_id: tenantId } : {}),
                            attributes: {
                                [fieldName]: attributes[fieldName]
                            },
                            is_deleted: false
                        },
                        transaction
                    })
                )
            );
            const duplicates = duplicateChecks
                .filter(Boolean)
                .map((dup, index) => ({
                    field: uniqueFields[index],
                    value: attributes[uniqueFields[index]],
                    existingResourceId: dup.id,
                    existingResourceName: dup.name
                }));

            if (duplicates.length > 0) {
                throw {
                    name: 'DuplicateError',
                    details: duplicates,
                    message: `Duplicate Error: ${JSON.stringify(duplicates)}`
                };
            }
        }

        return {
            parentResource,
            fieldDefinitions
        };
    }

    async createResource({ resource_name, attributes, relationships = [], tenant_id, resource_parent_id }, transaction = null) {


        if (!resource_name || typeof resource_name !== 'string') {
            throw new Error('Resource name is required and must be a string');
        }

        if (!attributes || typeof attributes !== 'object') {
            throw new Error('Attributes must be an object');
        }

        // if (!tenant_id) {
        //     throw new Error('Tenant ID is required');
        // }


        const options = { transaction };
        const { parentResource } = await this.validateResourceAttributes(
            attributes,
            resource_name,
            (tenant_id ? tenant_id : null),
            transaction
        );

        try {
            // Create the resource with tenant_id
            const resource = await this.ResourceTag.create({
                resource_type: 'resource',
                resource_name: resource_name,
                resource_parent_id: resource_parent_id || parentResource?.id || null,
                ...(tenant_id ? { tenant_id: tenant_id } : {}),
                attributes
            }, options);

            if (resource.resource_name == 'organizations') {
                if (!tenant_id) {
                    resource.tenant_id = resource.id;
                    resource.save()
                }

            }


            // Process relationships if any exist
            if (relationships.length > 0) {
                await this.createRelationships({
                    sourceResourceId: resource.id,
                    relationships,
                    ...(tenant_id ? { tenant_id: tenant_id } : {}),
                    transaction
                });
            }

            return this.getResourceWithRelationships(resource.id, tenant_id, transaction);
        } catch (error) {
            console.error('Error creating resource:', error);
            throw error;
        }
    }

    async createRelationships({ sourceResourceId, relationships, tenant_id, transaction = null }) {
        if (!sourceResourceId) {
            throw new Error('Source resource ID is required');
        }

        if (!Array.isArray(relationships)) {
            throw new Error('Relationships must be an array');
        }

        const options = { transaction };

        console.log(relationships, 'RELATIONSHIT', sourceResourceId)
        const relationshipPromises = relationships.map(async (rel) => {
            if (!rel.target_resource_id || (!rel.relationship_name && !rel.relationship_type)) {
                throw new Error('Each relationship requires target_resource_id and relationship_name');
            }

            // Check if target resource exists and belongs to the same tenant
            const targetExists = await this.ResourceTag.findOne({
                where: {
                    id: rel.target_resource_id,
                    is_deleted: false
                    // tenant_id: tenant_id
                },
                options
            });
            if (!targetExists) {
                throw new Error(`Target resource ${rel.target_resource_id} not found for this tenant`);
            }

            return this.ResourceRelationship.create({
                source_resource_id: sourceResourceId,
                target_resource_id: rel.target_resource_id,
                relationship_name: rel.relationship_name || rel.relationship_type,
                // tenant_id: tenant_id,
                attributes: rel.attributes || null,
                start_at: rel.start_at || null,
                end_at: rel.end_at || null,
                isActive: rel.isActive !== false,
                metadata: rel.metadata || {}
            }, options);
        });

        await Promise.all(relationshipPromises);
    }

    async getResourceWithRelationships(resourceId, tenantId, transaction = null) {
        const options = {
            where: { tenant_id: tenantId },
            include: [{
                model: this.ResourceRelationship,
                as: 'outgoing_relationships',
                where: { source_resource_id: resourceId, tenant_id: tenantId },
                required: false
            }, {
                model: this.ResourceRelationship,
                as: 'incoming_relationships',
                where: { target_resource_id: resourceId, tenant_id: tenantId },
                required: false
            }],
            transaction
        };

        const resource = await this.ResourceTag.findByPk(resourceId, options);

        if (!resource) {
            throw new Error('Resource not found');
        }

        return {
            ...resource.toJSON(),
            relationships: {
                outgoing: resource.outgoingRelationships,
                incoming: resource.incomingRelationships
            }
        };
    }

    async getResourceById(id, tenantId, options = {}) {
        // if (!tenantId) {
        //     throw new Error('Tenant ID is required');
        // }

        const include = [
            {
                model: this.ResourceRelationship,
                as: 'outgoing_relationships',
                where: { is_deleted: false, tenant_id: tenantId },
                required: false,
                include: [{
                    model: this.ResourceTag,
                    as: 'target_resource',
                    where: { is_deleted: false, tenant_id: tenantId },
                    required: false
                }]
            },
            {
                model: this.ResourceRelationship,
                as: 'incoming_relationships',
                where: { is_deleted: false, tenant_id: tenantId },
                required: false,
                include: [{
                    model: this.ResourceTag,
                    as: 'source_resource',
                    where: { is_deleted: false, tenant_id: tenantId },
                    required: false
                }]
            }
        ];

        if (options.includeParent) {
            include.push({
                model: this.ResourceTag,
                as: 'parent',
                attributes: ['id', 'resource_name']
            });
        }

        let whereClause = {
            tenant_id: tenantId, is_deleted: false
        };

        if (Number.isInteger(id) || /^\d+$/.test(id)) {
            whereClause.id = id;
        } else {
            whereClause.resource_name = id;
        }

        return await this.ResourceTag.findOne({
            where: whereClause,
            include
        });
    }

    async getResourcesByType(identifier, tenantId) {
        // if (!tenantId) {
        //     throw new Error('Tenant ID is required');
        // }



        const sequelize = this.sequelize || db.sequelize;
        if (!sequelize) {
            throw new Error('Sequelize instance not available');
        }

        const include = [
            {
                model: this.ResourceRelationship,
                as: 'outgoing_relationships',
                where: { is_deleted: false },
                required: false,
                include: [{
                    model: this.ResourceTag,
                    as: 'target_resource',
                    where: { is_deleted: false },
                    required: false
                }]
            },
            {
                model: this.ResourceRelationship,
                as: 'incoming_relationships',
                where: { is_deleted: false },
                required: false,
                include: [{
                    model: this.ResourceTag,
                    as: 'source_resource',
                    where: { is_deleted: false },
                    required: false
                }]
            }
        ];

        try {
            let parentId;

            if (Number.isInteger(identifier) || /^\d+$/.test(identifier)) {
                parentId = identifier;
            } else {
                const parentResource = await this.ResourceTag.findOne({
                    where: {
                        is_deleted: false,
                        resource_type: 'config',
                        ...(tenantId ? { tenant_id: tenantId } : {}),
                        resource_name: sequelize.where(
                            sequelize.fn('LOWER', sequelize.col('resource_name')),
                            '=',
                            identifier.toLowerCase()
                        )
                    },
                    attributes: ['id']
                });
                console.log('PARENT', parentResource)
                if (!parentResource) return [];
                parentId = parentResource.id;
            }



            return await this.ResourceTag.findAll({
                where: {
                    resource_type: 'resource',
                    ...(identifier != 'organizations' ? { resource_parent_id: parentId } : { resource_name: 'organizations' }),
                    is_deleted: false,
                    ...((tenantId && identifier != 'organizations') ? { tenant_id: tenantId } : {})
                },
                include: include,
                order: [['created_at', 'DESC']]
            });

        } catch (error) {
            console.log('Error in getResourcesByType:', error);
            throw error;
        }
    }


    async getResourceTypeConfig(identifier, tenantId) {
        // if (!tenantId) {
        //     throw new Error('Tenant ID is required');
        // }



        const sequelize = this.sequelize || db.sequelize;
        if (!sequelize) {
            throw new Error('Sequelize instance not available');
        }

        const include = [
            {
                model: this.ResourceRelationship,
                as: 'outgoing_relationships',
                where: { is_deleted: false },
                required: false,
                include: [{
                    model: this.ResourceTag,
                    as: 'target_resource',
                    where: { is_deleted: false },
                    required: false
                }]
            },
            {
                model: this.ResourceRelationship,
                as: 'incoming_relationships',
                where: { is_deleted: false },
                required: false,
                include: [{
                    model: this.ResourceTag,
                    as: 'source_resource',
                    where: { is_deleted: false },
                    required: false
                }]
            }
        ];

        try {


            return await this.ResourceTag.findOne({
                where: {
                    resource_type: 'config',
                    resource_name: identifier,
                    is_deleted: false,
                    ...(tenantId ? { tenant_id: tenantId } : {})
                },
                include: include
            });

        } catch (error) {
            console.log('Error in getResourcesByType:', error);
            throw error;
        }
    }

    async updateResource(id, { name, attributes, tenant_id, position }, transaction) {
        if (!tenant_id) {
            throw new Error('Tenant ID is required');
        }

        const resource = await this.ResourceTag.findOne({
            where: {
                id: id,
                tenant_id: tenant_id
            },
            include: [{
                model: this.ResourceTag,
                as: 'parent',
                attributes: ['id', 'resource_name']
            }],
            transaction
        });

        if (!resource) {
            throw new Error('Resource not found');
        }

        const updates = {};
        if (name) updates.resource_name = name;
        if (attributes) updates.attributes = attributes;
        if (position) updates.position = position;
        if (name && name !== resource.resource_name) {
            const existingWithSameName = await this.ResourceTag.findOne({
                where: {
                    [this.Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('lower', Sequelize.col('resource_name')),
                            Sequelize.fn('lower', name)
                        ),
                        {
                            resource_parent_id: resource.resource_parent_id,
                            tenant_id: tenant_id
                        }
                    ],
                    id: { [this.Op.ne]: id }
                },
                transaction
            });

            if (existingWithSameName) {
                throw {
                    name: 'ConflictError',
                    message: 'Resource with this name already exists under the same parent',
                    details: {
                        existingResource: {
                            id: existingWithSameName.id,
                            name: existingWithSameName.name
                        }
                    }
                };
            }
        }

        await resource.update(updates, { transaction });
        return resource;
    }

    async toggleDeleteResource(id, tenantId, transaction) {
        if (!tenantId) {
            throw new Error('Tenant ID is required');
        }

        const resource = await this.ResourceTag.findOne({
            where: {
                id: id,
                tenant_id: tenantId
            },
            transaction
        });

        if (!resource) {
            throw new Error('Resource not found');
        }

        const newDeletedStatus = !resource.is_deleted;

        await this.ResourceTag.update(
            { is_deleted: newDeletedStatus },
            {
                where: {
                    id: id,
                    tenant_id: tenantId
                },
                transaction
            }
        );

        await this.ResourceRelationship.update(
            { is_deleted: newDeletedStatus },
            {
                where: {
                    [this.Op.or]: [
                        { source_resource_id: id },
                        { target_resource_id: id }
                    ],
                    tenant_id: tenantId
                },
                transaction
            }
        );

        return {
            resource,
            is_deleted: newDeletedStatus
        };
    }
}

export default new ResourceService();