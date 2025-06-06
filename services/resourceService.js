import { ResourceTag } from '../models/resourceTag.model.js'; // Adjust path as needed

export async function getFilteredResources(resourceType, filters = {}) {
    const query = {
        $and: [
            {
                resourceType: { $regex: new RegExp(resourceType, 'i') } // partial, case-insensitive
            },
            {
                name: { $ne: 'config' } // exclude 'config'
            }
        ]
    };

    let conf = await ResourceTag.findOne({ resourceType, name: 'config' });


    // Add filter for each key-value pair
    for (const [key, value] of Object.entries(filters)) {
        let fExist = false;
        if (conf && conf.fields) {
            fExist = conf.fields.find(a => a.fieldName == key);
        }
        if (value && fExist) {
            query.$and.push({
                values: {
                    $elemMatch: {
                        fieldName: new RegExp(`^${key}$`, 'i'), // case-insensitive field name match
                        value: { $regex: new RegExp(value, 'i') } // exact match, case-insensitive
                    }
                }
            });
        }
    }

    try {
        const matchedResources = await ResourceTag.find(query).lean();

        const filtered = matchedResources.map(doc => {
            const resourceObj = {};
            resourceObj['name'] = doc.name;
            // Map all values to key-value object
            doc.values.forEach(({ fieldName, value }) => {
                resourceObj[fieldName] = value;
            });

            return resourceObj;
        });

        return filtered;
    } catch (err) {
        console.error('[getFilteredResources] Error:', err);
        throw err;
    }
}


