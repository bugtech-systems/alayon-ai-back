// config/swagger-config.js
import swaggerJsdoc from 'swagger-jsdoc';

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'PostgreSQL API Documentation',
        version: '1.0.0',
        description: 'API documentation for your PostgreSQL Express application',
    },
    servers: [
        {
            url: 'http://localhost:3000/apiv1/v1',
            description: 'Development Server',
        },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
        },
        schemas: {
            ResourceType: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' },
                    type: { type: 'string', enum: ['resource', 'config', 'connections'] },
                },
            },
            // Add more schemas as needed
        },
    },
};

const options = {
    swaggerDefinition,
    apis: ['./routes/*.js'], // Path to your route files
};

export const swaggerSpec = swaggerJsdoc(options);