export const config = [
    {
        "resource_name": "users",
        "fields": [
            {
                "field_name": "username",
                "data_type": "string",
                "is_required": true,
                "is_unique": true
            },
            {
                "field_name": "age",
                "data_type": "number"
            },
            {
                "field_name": "profile",
                "data_type": "json"
            },
            {
                "field_name": "status",
                "data_type": "string"
            }
        ]
    },
    {
        "resource_name": "organizations",
        "fields": [
            {
                "field_name": "name",
                "data_type": "string",
                "is_required": true
            },
            {
                "field_name": "address",
                "data_type": "string",
                "is_required": true
            },
            {
                "field_name": "type",
                "data_type": "string",
                "is_required": true
            }
        ]
    },
    {
        "resource_name": "navigations",
        "fields": [
            {
                "field_name": "title",
                "data_type": "string",
                "is_required": true
            },
            {
                "field_name": "url",
                "data_type": "string",
                "is_required": true
            },
            {
                "field_name": "icon",
                "data_type": "string",
                "is_required": true
            },
            {
                "field_name": "module",
                "data_type": "string",
                "is_required": true
            }
        ]
    },
    // {
    //     "resource_name": "roles",
    //     "fields": [
    //         {
    //             "field_name": "name",
    //             "data_type": "string",
    //             "is_required": true
    //         },
    //         {
    //             "field_name": "description",
    //             "data_type": "string",
    //             "is_required": true
    //         },
    //         {
    //             "field_name": "value",
    //             "data_type": "string",
    //             "is_required": true
    //         }
    //     ]
    // },
    // {
    //     "resource_name": "status",
    //     "fields": [
    //         {
    //             "field_name": "name",
    //             "data_type": "string",
    //             "is_required": true
    //         },
    //         {
    //             "field_name": "description",
    //             "data_type": "string",
    //             "is_required": true
    //         },
    //         {
    //             "field_name": "value",
    //             "data_type": "string",
    //             "is_required": true
    //         }
    //     ]
    // }
]

export const action_templates = [
    {
        "name": "find_resource_config_name",
        "tool_type": "API_CALL",
        "description": "Find single resource config or resource setup with type config.",
        "output_as": "config",
        "config": {
            "url": "http://localhost:3300/api/v1/resource-types/{{params.resource_name}}",
            "method": "GET",
        },
        "parameters": [
            {
                "field_name": "resource_name",
                "data_type": "string",
                "is_required": true
            }
        ]
    },
    {
        "name": "find_resources",
        "tool_type": "API_CALL",
        "description": "Find all resources record in collection.",
        "output_as": "{{params.resource_name}}",
        "config": {
            "url": "http://localhost:3300/api/v1/resources/type/{{params.resource_name}}",
            "method": "GET",
        },
        "parameters": [
            {
                "field_name": "resource_name",
                "data_type": "string",
                "is_required": true
            }
        ]
    },
    {
        "name": "setup_resource_config",
        "tool_type": "API_CALL",
        "description": "Setup new resource type config or create new resource collection.",
        "output_as": "config",
        "config": {
            "url": "http://localhost:3300/api/v1/resource-types",
            "method": "POST",
            "body": {
                "resource_name": "{{params.resource_name}}",
                "resource_type": "config",
                "fields": "{{params.fields}}"
            }
        },
        "parameters": [
            {
                "field_name": "resource_name",
                "data_type": "string",
                "is_required": true
            },
            {
                "field_name": "fields",
                "data_type": "array",
                "is_required": true
            }
        ]
    },
    {
        "name": "create_resource",
        "tool_type": "DB_OPERATION",
        "description": "Create new resource record or new data.",
        "output_as": "{{params.resource_name}}",
        "pre_hooks": [
            {
                "template": "find_resource_config_name",
                "parameters": {
                    "resource_name": "{{params.resource_name}}",
                }
            }
        ],
        "config": {
            "model": "ResourceTag",
            "operation": "create",
            "data": {
                "resource_name": "{{params.resource_name}}",
                "resource_type": "resource",
                "attributes": "{{params.attributes}}",
                "resource_parent_id": "{{outputs.config.id}}"
            }
        },
        "parameters": [
            {
                "field_name": "resource_name",
                "data_type": "string",
                "is_required": true
            },
            {
                "field_name": "attributes",
                "data_type": "object",
                "is_required": true,
                "default_value": {}
            }
        ]
    },
    {
        "name": "send_email",
        "tool_type": "EMAIL",
        "description": "Send email to one or multiple recipients with HTML content and attachments.",
        "output_as": "resource",
        "config": {
            "from": "{{params.from}}",
            "to": "{{params.to}}",
            "subject": "{{params.subject}}",
            "body": "{{params.body}}",
            "attachments": "{{params.attachments}}"
        },
        "parameters": [
            {
                "field_name": "from",
                "data_type": "string",
                "is_required": true,
                "validation": "email",
                "description": "Sender email address"
            },
            {
                "field_name": "to",
                "data_type": "string",
                "is_required": true,
                "validation": "email",
                "description": "Recipient email(s)"
            },
            {
                "field_name": "subject",
                "data_type": "string",
                "is_required": true,
                "description": "Email subject line"
            },
            {
                "field_name": "body",
                "data_type": "string",
                "is_required": true,
                "description": "HTML email content"
            },
            {
                "field_name": "attachments",
                "data_type": "array",
                "is_required": false,
                "description": "Array of attachment objects",
                "structure": [
                    {
                        "filename": "string",
                        "path": "string",
                        "contentType": "string"
                    }
                ]
            }
        ],

    }
]