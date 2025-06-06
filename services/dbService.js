// services/dbService.js
const { ResourceTag } = require('../models/ResourceTag');

async function getDefaultsFromDB(resourceType = null) {
    const allResources = await ResourceTag.find({});
    const organizations = [...new Set(allResources.map(r => r.resourceParent).filter(Boolean))];
    const resourceTypes = [...new Set(allResources.map(r => r.resourceType))];

    if (!resourceType) {
        // Return only organizations and resourceTypes if resourceType not specified
        return { organizations, resourceTypes };
    }

    // When resourceType is provided, fetch requiredFields and fieldOptions
    const samples = allResources.filter(r => r.resourceType === resourceType);
    if (!samples.length) {
        return { organizations, resourceTypes, requiredFields: [], fieldOptions: {} };
    }

    // Take the first sample as schema reference
    const sample = samples[0];
    const requiredFields = sample.fields.filter(f => f.required).map(f => f.fieldName);

    const fieldOptions = {};
    for (const field of sample.fields) {
        const values = samples.flatMap(r =>
            r.values.filter(v => v.fieldName === field.fieldName).map(v => v.value)
        );
        const uniqueValues = [...new Set(values)];
        fieldOptions[field.fieldName] = uniqueValues.slice(0, 5);
    }

    return { organizations, resourceTypes, requiredFields, fieldOptions };
}

// Other functions remain unchanged
async function saveToMongo(ctx) {
    const { resourceType, queryfields, organization } = ctx;

    const doc = new ResourceTag({
        resourceType,
        name: `${resourceType}-${Date.now()}`,
        values: Object.entries(queryfields).map(([fieldName, value]) => ({ fieldName, value })),
        resourceParent: organization
    });

    return await doc.save();
}

async function queryMongo(resourceType, queryfields) {
    const conditions = Object.entries(queryfields).map(([key, val]) => ({
        values: { $elemMatch: { fieldName: key, value: val } }
    }));

    return await ResourceTag.find({
        resourceType,
        ...(conditions.length > 0 ? { $and: conditions } : {})
    });
}

module.exports = {
    getDefaultsFromDB,
    saveToMongo,
    queryMongo
};
