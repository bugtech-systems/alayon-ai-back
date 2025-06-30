export const resourceConfigs = {
    organizations: [
        "Acme Corporation",
        "TechGlobal Inc",
        "DataSystems LLC",
        "InnovateX Ltd"
    ],
    resources: {
        "Acme Corporation": ["customer-contacts", "inventory", "suppliers"],
        "TechGlobal Inc": ["projects", "employees", "clients"],
        "DataSystems LLC": ["datasets", "reports", "users"],
        "InnovateX Ltd": ["products", "orders", "vendors"]
    },
    resourceSchema: {
        name: 'ResourceTag',
        fields: {
            type: {
                type: 'string',
                enum: ['resource', 'config', 'connections'],
                required: true
            },
            name: {
                type: 'string',
                required: true,
                validation: 'minLength:3,maxLength:50'
            },
            fields: {
                type: 'array',
                itemSchema: {
                    fieldName: 'string',
                    dataType: 'string',
                    required: 'boolean',
                    validation: 'string'
                }
            },
            values: {
                type: 'array',
                itemSchema: {
                    fieldName: 'string',
                    value: 'mixed',
                    resource: 'ObjectId'
                }
            },
            relationships: {
                type: 'array',
                itemSchema: {
                    type: 'string',
                    refType: 'string',
                    refId: 'ObjectId'
                }
            }
        },
        required: ['type', 'name', 'values']
    },
    configSchema: {
        name: 'ResourceTag',
        fields: {
            type: {
                type: 'string',
                enum: ['resource', 'config', 'connections'],
                required: true
            },
            name: {
                type: 'string',
                required: true,
                validation: 'minLength:3,maxLength:50'
            },
            fields: {
                type: 'array',
                itemSchema: {
                    fieldName: 'string',
                    dataType: 'string',
                    required: 'boolean',
                    validation: 'string'
                }
            },
        },
        required: ['type', 'name', 'fields']
    }
    // ... rest of your existing config
};