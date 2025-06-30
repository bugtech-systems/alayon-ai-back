import { db } from '../models/index.js';
import { Sequelize } from 'sequelize';

class ResourceService {

    constructor() {
        this.ResourceTag = db.ResourceTag;
        this.ResourceField = db.ResourceField;
        this.ResourceRelationship = db.ResourceRelationship;
        this.ResourceValue = db.ResourceValue;
        this.Op = Sequelize.Op;
    }

    async validateResourceAttributes(attributes, resourceName, transaction) {
        // Find parent config resource
        const parentResource = await this.ResourceTag.findOne({
            where: {
                [this.Op.and]: [
                    Sequelize.where(
                        Sequelize.fn('lower', Sequelize.col('name')),
                        Sequelize.fn('lower', resourceName)
                    ),
                    { type: 'config' }
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

        if (!parentResource) {
            throw new Error(`Parent config resource not found for name: ${resourceName}`);
        }

        console.log(parentResource, 'paar')

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
        console.log(fieldDefinitions, 'field Def')

        // 1. Check for invalid fields
        const invalidFields = Object.keys(attributes).filter(
            fieldName => !fieldDefinitions[fieldName]
        );

        if (invalidFields.length > 0) {
            validationErrors.push({
                type: 'INVALID_FIELDS',
                message: 'Fields not defined in parent config',
                details: {
                    invalidFields,
                    validFields: Object.keys(fieldDefinitions)
                }
            });
        }

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


        console.log(missingRequiredFields, invalidFields)
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
                details: validationErrors,
                message: 'VAlidation Error'

            };
        }


        console.log(validationErrors, 'val')
        // 4. Check for duplicate values in unique fields
        const uniqueFields = Object.entries(fieldDefinitions)
            .filter(([_, def]) => def.isUnique)
            .map(([fieldName]) => fieldName);
        console.log(uniqueFields, 'val')

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
            console.log(duplicates)

            if (duplicates.length > 0) {
                throw {
                    name: 'DuplicateError',
                    details: duplicates,
                    message: 'Duplicate Error'
                };
            }
        }

        console.log(parentResource, fieldDefinitions, 'paar')
        return {
            parentResource,
            fieldDefinitions
        };
    }

    async createResource({ name, attributes }, transaction) {

        const { parentResource } = await this.validateResourceAttributes(
            attributes,
            name,
            transaction
        );


        console.log(parentResource, name, attributes, 'crrr')
        const resource = await this.ResourceTag.create({
            type: 'resource',
            name,
            resource_parent_id: parentResource.id,
            attributes
        }, { transaction });

        return resource;
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
                attributes: ['id', 'name']
            });
        }

        return await this.ResourceTag.findByPk(id, { include });
    }

    async getResourcesByType(identifier) {
        // Determine if the identifier is an ID (number) or name (string)
        const whereCondition = Number.isInteger(identifier) || /^\d+$/.test(identifier)
            ? { resource_parent_id: identifier }
            : {
                resource_parent_id: sequelize.literal(
                    `(SELECT id FROM resource_tags WHERE LOWER(name) = LOWER('${identifier.replace(/'/g, "''")}')`
                )
            };

        return await this.ResourceTag.findAll({
            where: {
                ...whereCondition,
                is_deleted: false
            },
            include: [
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
                }
            ],
            order: [['created_at', 'DESC']]
        });
    }

    async updateResource(id, { name, attributes }, transaction) {
        const resource = await this.ResourceTag.findByPk(id, {
            include: [{
                model: this.ResourceTag,
                as: 'parent',
                attributes: ['id', 'name']
            }],
            transaction
        });

        if (!resource) {
            throw new Error('Resource not found');
        }

        const updates = {};
        if (name) updates.name = name;
        if (attributes) updates.attributes = attributes;

        if (attributes && resource.resource_parent_id) {
            await this.validateResourceAttributes(
                { ...resource.attributes, ...attributes },
                resource.parent.name,
                transaction
            );
        }

        if (name && name !== resource.name) {
            const existingWithSameName = await this.ResourceTag.findOne({
                where: {
                    [this.Op.and]: [
                        Sequelize.where(
                            Sequelize.fn('lower', Sequelize.col('name')),
                            Sequelize.fn('lower', name)
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

        await this.ResourceValue.update(
            { is_deleted: newDeletedStatus },
            {
                where: { resource_tag_id: id },
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