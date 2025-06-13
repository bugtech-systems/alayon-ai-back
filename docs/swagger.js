// docs/swagger.js
import swaggerJSDoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Alayon AI API",
      version: "1.0.0",
      description: "API documentation for Alayon AI backend services",
    },
    servers: [
      {
        url: "http://localhost:3500/api",
      },
    ],
    tags: [
      {
        name: "ResourceTag",
        description: "Manage Resource metadata and dynamic fields",
      },
      {
        name: "Touchpoint",
        description: "Track changes and interactions with resources",
      },
    ],
    components: {
      schemas: {
        // ✅ Added Field schema (to fix unresolved $ref errors)
        Field: {
          type: "object",
          required: ["fieldName", "dataType"],
          properties: {
            fieldName: { type: "string" },
            dataType: { type: "string" },
            description: { type: "string" },
            required: { type: "boolean", default: false },
          },
        },

        // Shared Value schema
        Value: {
          type: "object",
          properties: {
            fieldName: { type: "string" },
            value: {
              oneOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "array", items: { type: "string" } },
              ],
            },
          },
        },

        // Touchpoint Schemas
        TouchpointInput: {
          type: "object",
          required: ["action", "resourceId"],
          properties: {
            action: {
              type: "string",
              enum: ["created", "updated", "deleted"],
            },
            timestamp: { type: "string", format: "date-time" },
            values: {
              type: "array",
              items: { $ref: "#/components/schemas/Value" },
            },
            notes: { type: "string" },
            resourceId: {
              type: "string",
              description: "ObjectId reference to ResourceTag",
            },
          },
        },
        Touchpoint: {
          allOf: [
            { $ref: "#/components/schemas/TouchpointInput" },
            {
              type: "object",
              properties: {
                _id: { type: "string" },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
          ],
        },

        // ResourceInput schema
        ResourceInput: {
          type: "object",
          required: ["name", "resourceType"],
          properties: {
            name: { type: "string" },
            resourceType: { type: "string" },
            fields: {
              type: "array",
              items: { $ref: "#/components/schemas/Field" },
            },
            values: {
              type: "array",
              items: { $ref: "#/components/schemas/Value" },
            },
            relationships: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  refId: { type: "string" },
                },
              },
            },
          },
        },

        // Base Resource schema
        Resource: {
          allOf: [
            {
              type: "object",
              properties: {
                _id: { type: "string" },
                name: { type: "string" },
                resourceType: { type: "string" },
                resourceParent: { type: "string", nullable: true },
              },
            },
            {
              type: "object",
              properties: {
                fields: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Field" },
                },
                values: { type: "array", items: { type: "object" } },
                relationships: { type: "array", items: { type: "object" } },
              },
            },
          ],
        },

        // Resolved version of Resource
        ResourceResolved: {
          allOf: [
            { $ref: "#/components/schemas/Resource" },
            {
              type: "object",
              properties: {
                resolvedFields: {
                  type: "array",
                  items: { type: "object" },
                },
              },
            },
          ],
        },

        // Used to explicitly reference the Resource tag
        ResourceTag: {
          allOf: [{ $ref: "#/components/schemas/Resource" }],
        },
      },
    },
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(options);
export default swaggerSpec;
