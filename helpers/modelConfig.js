import { db } from '../models/index.js';
import { findResourceByName, getResourceOptions, getResourcesByType } from '../services/ResourceService.js';


export const validationConfig = async () => {


    let resources = await getResourcesByType('config');
    let allowedResources = [];
    let allowedFields = {};
    let fieldOptions = {}

    for (const resrce of resources) {
        let resource = await findResourceByName(resrce.name);

        if (resource) {
            allowedResources.push(resource.name)
            allowedFields[resource.name] = [];
            let options = {};
            let selectFields = resource?.fields.filter(a => a.data_type == 'select').map(a => a.options_resource_type);

            if (selectFields.length) {
                options = await getResourceOptions(selectFields);
            }
            for (let field of resource.fields) {
                allowedFields[resource.name].push(`attributes.${field.field_name}`);
                if (field.options_resource_type && options[field.options_resource_type]) {
                    fieldOptions[`${resource.name}.attributes.${field.field_name}`] = options[field.options_resource_type]
                }

            }
        }

    }
    // Allowed resource names
    // let resource = await findResourceByName(resourceName);
    // console.log(resource, 'resource')

    // let selectFields = resource?.fields.filter(a => a.data_type == 'select').map(a => a.options_resource_type);



    return {
        allowedResources: allowedResources,

        // Allowed fields per resource (including JSONB paths)
        allowedFields: allowedFields,

        // Field value options
        fieldOptions: fieldOptions
    };
}