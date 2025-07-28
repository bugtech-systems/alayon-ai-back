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

    async validateResourceAttributes(attributes, resourceName, transaction) {
        // Find parent config resource
        const parentResourceData = await this.ResourceTag.findOne({
            where: {
                [this.Op.and]: [
                    Sequelize.where(
                        Sequelize.fn('lower', Sequelize.col('resource_name')),
                        Sequelize.fn('lower', resourceName)
                    ),
                    { resource_type: 'config', is_deleted: false }
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


        const parentResource = parentResourceData.get({ plain: true })


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

        // // 1. Check for invalid fields
        // const invalidFields = Object.keys(attributes).filter(
        //     fieldName => !fieldDefinitions[fieldName]
        // );

        // if (invalidFields.length > 0) {
        //     validationErrors.push({
        //         type: 'INVALID_FIELDS',
        //         message: 'Fields not defined in parent config',
        //         details: {
        //             invalidFields,
        //             validFields: Object.keys(fieldDefinitions)
        //         }
        //     });
        // }

        // 2. Check for missing required fields
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


        // 3. Validate field types
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


        // 4. Check for duplicate values in unique fields
        const uniqueFields = Object.entries(fieldDefinitions)
            .filter(([_, def]) => def.isUnique)
            .map(([fieldName]) => fieldName);

        if (uniqueFields.length > 0) {
            const duplicateChecks = await Promise.all(
                uniqueFields.map(fieldName =>
                    this.ResourceTag.findOne({
                        where: {
                            resource_parent_id: parentResource.id,
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

    /**
     * Creates a resource with optional relationships
     * @param {Object} params - Creation parameters
     * @param {string} params.name - Resource name
     * @param {Object} params.attributes - Resource attributes
     * @param {Array} [params.relationships] - Array of relationships to create
     * @param {Object} [transaction] - Sequelize transaction object
     * @returns {Promise<Object>} Created resource with relationships
     */
    async createResource({ resource_name, attributes, relationships = [] }, transaction = null) {
        // Validate input
        if (!resource_name || typeof resource_name !== 'string') {
            throw new Error('Resource name is required and must be a string');
        }

        if (!attributes || typeof attributes !== 'object') {
            throw new Error('Attributes must be an object');
        }

        const options = { transaction };
        const { parentResource } = await this.validateResourceAttributes(
            attributes,
            resource_name,
            transaction
        );

        console.log(parentResource, 'PARR')


        try {
            // Create the resource
            const resource = await this.ResourceTag.create({
                resource_type: 'resource',
                resource_name: resource_name,
                resource_parent_id: parentResource?.id || null,
                attributes
            }, options);

            // Process relationships if any exist
            if (relationships.length > 0) {
                await this.createRelationships({
                    sourceResourceId: resource.id,
                    relationships,
                    transaction
                });
            }


            // Return the resource with its relationships
            return this.getResourceWithRelationships(resource.id, transaction);
        } catch (error) {
            console.error('Error creating resource:', error);
            throw error;
        }
    }

    /**
     * Creates relationships for a resource
     * @param {Object} params
     * @param {number} params.sourceResourceId - ID of the source resource
     * @param {Array} params.relationships - Array of relationship objects
     * @param {Object} [transaction] - Sequelize transaction
     */
    async createRelationships({ sourceResourceId, relationships, transaction = null }) {

        console.log('CREATE RELATIONSHIPS', relationships)
        if (!sourceResourceId) {
            throw new Error('Source resource ID is required');
        }

        if (!Array.isArray(relationships)) {
            throw new Error('Relationships must be an array');
        }

        const options = { transaction };
        const relationshipPromises = relationships.map(async (rel) => {
            // Validate relationship
            if (!rel.target_resource_id || !rel.relationship_name) {
                throw new Error('Each relationship requires target_resource_id and relationship_name');
            }

            // Check if target resource exists
            const targetExists = await this.ResourceTag.findByPk(rel.target_resource_id, options);
            if (!targetExists) {
                throw new Error(`Target resource ${rel.target_resource_id} not found`);
            }

            // Create relationship
            return this.ResourceRelationship.create({
                source_resource_id: sourceResourceId,
                target_resource_id: rel.target_resource_id,
                relationship_name: rel.relationship_name,
                attributes: rel.attributes || null,
                start_at: rel.start_at || null,
                end_at: rel.end_at || null,
                isActive: rel.isActive !== false, // default true unless explicitly false
                metadata: rel.metadata || {}
            }, options);
        });

        await Promise.all(relationshipPromises);
    }

    /**
     * Gets a resource with its relationships
     * @param {number} resourceId - ID of the resource
     * @param {Object} [transaction] - Sequelize transaction
     * @returns {Promise<Object>} Resource with relationships
     */
    async getResourceWithRelationships(resourceId, transaction = null) {
        const options = {
            include: [{
                model: this.ResourceRelationship,
                as: 'outgoing_relationships',
                where: { source_resource_id: resourceId },
                required: false
            }, {
                model: this.ResourceRelationship,
                as: 'incoming_relationships',
                where: { target_resource_id: resourceId },
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

    async getResourceById(id, options = {}) {
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

        if (options.includeParent) {
            include.push({
                model: this.ResourceTag,
                as: 'parent',
                attributes: ['id', 'resource_name']
            });
        }

        let opts = {}

        if (Number.isInteger(id) || /^\d+$/.test(id)) {
            // If identifier is a number, use it directly as parent ID
            opts = { id: id }
        } else {
            opts = { resource_name: id }
        }





        return await this.ResourceTag.findOne({ where: opts }, { include });
    }

    async getResourcesByType(identifier) {
        // Ensure we have access to sequelize (assuming it's available as this.sequelize or db.sequelize)
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
                // If identifier is a number, use it directly as parent ID
                parentId = identifier;
            } else {
                // If identifier is a name, find the parent resource first
                const parentResource = await this.ResourceTag.findOne({
                    where: {
                        is_deleted: false,
                        resource_type: 'config',
                        resource_name: sequelize.where(
                            sequelize.fn('LOWER', sequelize.col('resource_name')),
                            '=',
                            identifier.toLowerCase()
                        )
                    },
                    attributes: ['id']
                });

                if (!parentResource) return [];
                parentId = parentResource.id;
            }


            console.log(parentId, 'PARENT')

            // Find all resources with this parent ID
            return await this.ResourceTag.findAll({
                where: {
                    resource_parent_id: parentId,
                    is_deleted: false,
                },
                include: include,
                order: [['created_at', 'DESC']]
            });
        } catch (error) {
            console.error('Error in getResourcesByType:', error);
            throw error;
        }
    }

    async updateResource(id, { resource_name, attributes }, transaction) {
        const resource = await this.ResourceTag.findByPk(id, {
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
        if (resource_name) updates.resource_name = resource_name;
        if (attributes) updates.attributes = attributes;

        // if (attributes && resource.resource_parent_id) {
        //     await this.validateResourceAttributes(
        //         { ...resource.attributes, ...attributes },
        //         resource.parent.name,
        //         transaction
        //     );
        // }

        if (resource_name && resource_name !== resource.resource_name) {
            const existingWithSameName = await this.ResourceTag.findOne({
                where: {
                    [this.Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('lower', Sequelize.col('resource_name')),
                            Sequelize.fn('lower', resource_name)
                        ),
                        { resource_parent_id: resource.resource_parent_id }
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

    async toggleDeleteResource(id, transaction) {
        const resource = await this.ResourceTag.findByPk(id, { transaction });

        if (!resource) {
            throw new Error('Resource not found');
        }

        const newDeletedStatus = !resource.is_deleted;

        await this.ResourceTag.update(
            { is_deleted: newDeletedStatus },
            {
                where: { id },
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
                    ]
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