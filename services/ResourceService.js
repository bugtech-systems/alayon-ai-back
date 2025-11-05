
import { sanitizePhoneNumber } from '../helpers/helpers.js';
import { db } from '../models/index.js';

// import { ResourceTag } from '../models/resourceTag.model.js'; // Your Sequelize model
// import { Op } from 'sequelize';

const ResourceTag = db.ResourceTag;
const Op = db.Op;
export async function formattedResourceObject(ids) {
    try {


        const resources = await db.ResourceTag.findAll({
            where: {
                id: { [db.Sequelize.Op.in]: ids }
            },
            include: [
                {
                    model: db.ResourceValue,
                    as: 'values',
                    where: { is_deleted: false },
                    required: false,
                    include: [{
                        model: db.ResourceTag,
                        as: 'related_resource',
                        where: { is_deleted: false },
                        required: false
                    }]
                },
                {
                    model: db.ResourceRelationship,
                    as: 'outgoing_relationships',
                    where: { is_deleted: false },
                    required: false,
                    include: [{
                        model: db.ResourceTag,
                        as: 'target_resource',
                        where: { is_deleted: false },
                        required: false
                    }]
                },
                {
                    model: db.ResourceRelationship,
                    as: 'incoming_relationships',
                    where: { is_deleted: false },
                    required: false,
                    include: [{
                        model: db.ResourceTag,
                        as: 'source_resource',
                        where: { is_deleted: false },
                        required: false
                    }]
                }
            ]
        });


        return resources
    } catch (err) {
        console.log(err, 'ERROR')
        return []
    }

}


export async function getFilteredResources(resourceType, filters = {}) {
    // Base query - resources of this type excluding configs
    const where = {
        resource_name: { [Op.iLike]: `%${resourceType}%` },
        resource_type: { [Op.ne]: 'config' },
        is_deleted: false
    };

    // Get configuration for this resource type
    const conf = await ResourceTag.findOne({
        where: {
            resource_name: resourceType,
            resource_type: 'config',
            is_deleted: false
        },
        raw: true
    });

    // Apply filters only if they exist in config
    const configFields = conf?.fields || [];
    const validFilters = Object.entries(filters).filter(([key]) =>
        configFields.some(f => f.fieldName.toLowerCase() === key.toLowerCase())
    );

    // Add filter conditions
    validFilters.forEach(([key, value]) => {
        if (value != null && value !== '') {
            where.attributes = {
                [Op.and]: [
                    { fieldName: { [Op.iLike]: key } },
                    typeof value === 'string'
                        ? { value: { [Op.iLike]: `%${value}%` } }
                        : { value }
                ]
            };
        }
    });

    try {
        const matchedResources = await ResourceTag.findAll({
            where,
            raw: true
        });

        // Transform results to key-value format
        return matchedResources.map(doc => ({
            id: doc.id,
            resource_name: doc.resource_name,
            ...(doc.attributes ? Object.fromEntries(
                Object.entries(doc.attributes).map(([fieldName, value]) => [fieldName, value])
            ) : {})
        }));
    } catch (err) {
        console.error('[getFilteredResources] Error:', err);
        throw err;
    }
}

// === Fetchers ===

export const getResourceTypes = async (excludeOrganizations = false) => {
    const types = await ResourceTag.findAll({
        attributes: ['resource_name'],
        where: { is_deleted: false, resource_type: 'config' },
        group: ['resource_name'],
        raw: true
    });

    const typeNames = types.map(t => t.resource_name);
    return excludeOrganizations
        ? typeNames.filter(t => t.toLowerCase() !== 'organizations')
        : typeNames;
};

export const getOrganizations = async () => {
    const orgs = await ResourceTag.findAll({
        where: {
            resource_name: { [Op.iLike]: 'organizations' },
            resource_type: { [Op.ne]: 'config' },
            is_deleted: false
        },
        raw: true
    });

    return orgs.map(org => {
        return org.attributes?.name || 'Unnamed';
    });
};

export const getOrganizationsByNumber = async (num) => {
    const org = await ResourceTag.findOne({
        where: {
            resource_name: { [Op.iLike]: 'organizations' },
            resource_type: 'resource',
            is_deleted: false,
            "attributes.phoneNumber": sanitizePhoneNumber(num)
        },
        raw: true
    });

    return org;
};

export const getOrganizationById = async (id) => {
    const org = await ResourceTag.findByPk(id);

    return org;
};

export const getResourcesByType = async (resourceType = 'config', options) => {
    const resources = await ResourceTag.findAll({
        where: {
            resource_type: resourceType,
            is_deleted: false
        },
        include: [
            {
                model: db.ResourceField,
                as: 'fields',
                attributes: ['field_name', 'data_type', 'is_required', 'description', 'options_resource_type'],
                where: { is_deleted: false },
                required: false
            },
        ],
        // raw: true
    });

    return resources;
};

export const getFieldsByResourceType = async (resourceType) => {
    const tag = await ResourceTag.findOne({
        where: {
            resource_type: 'config',
            resource_name: resourceType,
            is_deleted: false
        },
        raw: true
    });
    return tag?.fields || [];
};

export const findResourceByName = async (name) => {
    let resource = await db.ResourceTag.findOne({
        where: {
            resource_type: 'config',
            resource_name: { [Op.iLike]: name },
            is_deleted: false
        },
        attributes: ['id', 'resource_name'],
        include: [
            {
                model: db.ResourceField,
                as: 'fields',
                attributes: ['field_name', 'data_type', 'is_required', 'description', 'options_resource_type'],
                where: { is_deleted: false },
                required: false
            },
            {
                model: db.ActionTemplate,
                as: 'action_templates',
                where: { is_chat_enabled: true },
                required: false,
                attributes: ['name', 'description', 'conditions', 'field_mappings', 'action_type', 'aggregations'],
                include: [{
                    model: db.ActionTemplateParameter,
                    as: 'parameters',
                    required: false
                }]
            }
        ]
    }).catch(err => {
        console.log(err, 'RANGE ERR')
        return err
    });

    return resource ? resource.get({ plain: true }) : null
};

export const findActionTemplateByName = async (name, tenantId) => {
    let options = {};

    if (!name) {
        return null
    }

    if (Number.isInteger(name) || /^\d+$/.test(name)) {
        // If identifier is a number, use it directly as parent ID
        options = { id: name, ...(tenantId ? { tenant_id: tenantId } : {}) }
    } else {
        options = { name, ...(tenantId ? { tenant_id: tenantId } : {}) }
    }


    let resource = await db.ActionTemplate.findOne({
        where: options,
        attributes: ['id', 'name', 'description', 'parameters', 'output_as', 'tool_type', 'config'],
    }).catch(err => {
        console.log(err, 'RANGE ERR')
        return err
    });


    if (!resource) {
        return null
    }

    return resource.get({ plain: true })
};

export const findActionTemplates = async (type, tenantId) => {
    let options = {};

    if (!type) {
        return null
    }

    if (type == 'chat') {
        // If identifier is a number, use it directly as parent ID
        options = { is_chat_enabled: true, ...(tenantId ? { tenant_id: tenantId } : {}) }
    } else if (type == 'sms') {
            options = { is_sms_enabled: true, ...(tenantId ? { tenant_id: tenantId } : {}) }
    }


    let resource = await db.ActionTemplate.findAll({
        where: options,
        attributes: ['name', 'description', 'parameters', 'output_as', 'tool_type', 'config'],
        raw: true
    }).catch(err => {
        console.log(err, 'RANGE ERR')
        return err
    });


  

    return resource
};

export const getResourceOptions = async (name) => {
    const whereClause = {
        resource_type: 'resource',
        is_deleted: false,
        resource_name: Array.isArray(name)
            ? { [Op.or]: name.map(n => ({ [Op.iLike]: n })) }
            : { [Op.iLike]: name }
    };

    const resources = await ResourceTag.findAll({
        where: whereClause,
        raw: true
    });

    // Group by name and collect unique names from attributes
    const nameGroups = resources.reduce((acc, resource) => {
        const resourceName = resource.resource_name;
        if (acc[resourceName]) {
            acc[resourceName] = [...acc[resourceName], resource.attributes.name]; // Using object keys for automatic deduplication
        } else {
            acc[resourceName] = [resource.attributes.name]
        }
        return acc;
    }, {});

    return nameGroups; // Return array of unique names
};

// === Validators ===

export const validateFields = async (resourceType, values) => {
    const definedFields = await getFieldsByResourceType(resourceType);
    const validKeys = definedFields.map(f => f.fieldName);
    const filtered = {};

    for (const key of Object.keys(values)) {
        if (validKeys.includes(key)) {
            filtered[key] = values[key];
        }
    }

    return {
        values: filtered,
        missingFields: definedFields.filter(f => !(f.fieldName in values)),
    };
};

// === Relationships ===

export const formatRelationships = (relationships = []) => {
    return relationships
        .filter(r => r.type && r.refType && r.refId);
};

// === Mutators ===

export const createResource = async (name, values, options = {}) => {
    const { values: validatedValues, missingFields } = await validateFields(resourceType, values);
    const relationships = formatRelationships(options.relationships || []);

    // Check for existing resource first
    const existingResource = await ResourceTag.findOne({
        where: {
            resource_name: name,
            attributes: validatedValues
        }
    });

    if (existingResource) {
        if (relationships.length > 0) {
            await existingResource.update({
                relationships: [...(existingResource.relationships || []), ...relationships]
            });
            return await ResourceTag.findByPk(existingResource.id, { raw: true });
        }
        return existingResource;
    }

    // Create new resource
    return await ResourceTag.create({
        resource_name: name,
        attributes: validatedValues,
        relationships,
        resource_parent_id: options.resourceParent || null,
        ...options.meta,
        is_deleted: false
    });
};

export const updateResourceById = async (resourceId, updates) => {
    const resource = await ResourceTag.findByPk(resourceId);
    if (!resource) throw new Error('Resource not found');

    const updateData = {};
    if (updates.values) {
        const { values } = await validateFields(updates.resourceType, updates.values);
        updateData.attributes = values;
    }

    if (updates.relationships) {
        updateData.relationships = formatRelationships(updates.relationships);
    }

    await resource.update(updateData);
    return await ResourceTag.findByPk(resourceId, { raw: true });
};

export const deleteResourceById = async (resourceId) => {
    return await ResourceTag.update(
        { is_deleted: true },
        { where: { id: resourceId } }
    );
};

export const getResourceTypesByName = async () => {
    const types = await ResourceTag.findAll({
        attributes: ['resource_type'],
        group: ['resource_type'],
        raw: true
    });
    return types
        .map(t => t.type)
        .filter(t => t.toLowerCase() !== 'organizations');
};

export const getFieldsForResource = async (resourceType) => {
    const record = await ResourceTag.findOne({
        where: {
            resource_type: 'config',
            resource_name: resourceType
        },
        raw: true
    });
    if (!record || !Array.isArray(record.fields)) return [];
    return record.fields.map(f => f.fieldName);
};

export const getResourceFields = async (resourceType) => {
    const res = await ResourceTag.findOne({
        where: { resource_type: resourceType },
        raw: true
    });
    return res?.fields || [];
};

export const runQuery = async (session) => {
    const { action, resource, query_object } = session;

    switch (action) {
        case "create":
            return await ResourceTag.create({
                resource_type: resource,
                attributes: query_object,
                is_deleted: false
            });
        case "get":
            return await ResourceTag.findAll({
                where: {
                    resource_type: resource,
                    [Op.and]: Object.entries(query_object).map(([k, v]) => ({
                        [`attributes.${k}`]: typeof v === 'string' ? { [Op.iLike]: `%${v}%` } : v
                    }))
                },
                raw: true
            });
        case "update":
            return await ResourceTag.update(
                { attributes: query_object },
                { where: { resource_type: resource } }
            );
        case "delete":
            return await ResourceTag.update(
                { is_deleted: true },
                { where: { resource_type: resource } }
            );
        default:
            return null;
    }
};

export const resourceTagService = {
    async createWithConfig(data) {
        const values = resourceConfig.fields
            .filter(field => data[field.fieldName] !== undefined)
            .reduce((acc, field) => ({
                ...acc,
                [field.fieldName]: data[field.fieldName]
            }), {});

        return await ResourceTag.create({
            resource_type: data.resource_type || 'resource',
            resource_name: data.resource_name,
            attributes: values,
            is_deleted: false
        });
    },

    async findByConfig(filter) {
        const where = {
            is_deleted: false
        };

        if (filter.resource_type) where.resource_type = { [Op.in]: filter.types || resourceConfig.types };
        if (filter.resource_name) where.resource_name = { [Op.in]: filter.names || resourceConfig.names };

        if (filter.values) {
            where[Op.and] = filter.values.map(valueFilter => ({
                [`attributes.${valueFilter.fieldName}`]: valueFilter.value
            }));
        }

        return await ResourceTag.findAll({ where });
    }
};