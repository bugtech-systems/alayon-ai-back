// 📂 services/queryBuilder.js
import { ResourceTag } from '../../models/resourceTag.model.js';
import mongoose from 'mongoose';

export class QueryBuilder {
    constructor() {
        this.conversationHistory = [];
    }

    addToHistory(userPrompt, generatedQuery) {
        this.conversationHistory.push({
            timestamp: new Date(),
            userPrompt,
            generatedQuery
        });
    }

    async buildQueryFromPrompt(prompt) {
        // Analyze prompt to determine intent
        const intent = this.determineIntent(prompt);

        // Extract entities from prompt
        const { resourceType, resourceName, fields, relationships } = this.extractEntities(prompt);

        // Build base query structure
        let query = {
            intent,
            resourceType,
            resourceName,
            fields,
            relationships
        };

        // Generate MongoDB query based on intent
        switch (intent) {
            case 'create':
                query.mongoQuery = this.buildCreateQuery(query);
                break;
            case 'find':
                query.mongoQuery = this.buildFindQuery(query);
                break;
            case 'update':
                query.mongoQuery = this.buildUpdateQuery(query);
                break;
            case 'delete':
                query.mongoQuery = this.buildDeleteQuery(query);
                break;
        }

        this.addToHistory(prompt, query);
        return query;
    }

    async buildQueryContext(context) {
        // Analyze prompt to determine intent

        // Extract entities from prompt
        const { resourceType, type, name, resourceName, fields, relationships, intent, values } = context;

        // Build base query structure
        let query = {
            intent,
            resourceType: (resourceType || type),
            resourceName: (resourceName || name),
            fields: (resourceType || type) == 'config' ? fields : values,
            relationships
        };

        // Generate MongoDB query based on intent
        switch (intent) {
            case 'create':
                query.mongoQuery = this.buildCreateQuery(query);
                break;
            case 'find':
                query.mongoQuery = this.buildFindQuery(query);
                break;
            case 'update':
                query.mongoQuery = this.buildUpdateQuery(query);
                break;
            case 'delete':
                query.mongoQuery = this.buildDeleteQuery(query);
                break;
        }

        return query;
    }

    determineIntent(prompt) {
        const lowerPrompt = prompt.toLowerCase();
        if (lowerPrompt.includes('create') || lowerPrompt.includes('add')) return 'create';
        if (lowerPrompt.includes('update') || lowerPrompt.includes('modify')) return 'update';
        if (lowerPrompt.includes('delete') || lowerPrompt.includes('remove')) return 'delete';
        return 'find';
    }

    extractEntities(prompt) {
        // This would use more sophisticated NLP in production
        const typeMatch = prompt.match(/(resource|config|connections)/i);
        const nameMatch = prompt.match(/named\s+['"]?([^'"\s]+)['"]?/i);
        const fieldMatches = prompt.match(/(\w+)\s*:\s*([^,\n]+)/g);

        return {
            resourceType: typeMatch ? typeMatch[1].toLowerCase() : 'resource',
            resourceName: nameMatch ? nameMatch[1] : null,
            fields: fieldMatches ? this.parseFields(fieldMatches) : [],
            relationships: this.extractRelationships(prompt)
        };
    }

    parseFields(fieldStrings) {
        return fieldStrings.map(f => {
            const [fieldName, value] = f.split(':').map(s => s.trim());
            return { fieldName, value };
        });
    }

    extractRelationships(prompt) {
        // Extract relationship patterns like "related to user 12345"
        const relMatches = prompt.match(/(related to|connected to)\s+(\w+)\s+(\w+)/i);
        if (!relMatches) return [];

        return [{
            type: relMatches[2], // e.g., "user"
            refType: 'ResourceTag',
            refId: new mongoose.Types.ObjectId(relMatches[3]) // e.g., "12345"
        }];
    }

    buildCreateQuery({ resourceType, resourceName, fields, relationships }) {
        return {
            collection: 'ResourceTag',
            operation: 'insertOne',
            document: {
                type: resourceType,
                name: resourceName,
                values: resourceType == 'config' ? fields : fields.map(f => ({
                    fieldName: f.fieldName,
                    value: f.value
                })),
                fields,
                relationships,
                isDeleted: false,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        };
    }

    buildFindQuery({ resourceType, resourceName, fields, relationships }) {
        const filter = { isDeleted: false };

        if (resourceType) filter.type = resourceType;
        if (resourceName) filter.name = resourceName;

        if (fields.length > 0) {
            filter.$and = fields.map(f => ({
                'values.fieldName': f.fieldName,
                'values.value': f.value
            }));
        }

        if (relationships?.length > 0) {
            filter.relationships = {
                $elemMatch: {
                    type: relationships[0]?.type,
                    refId: relationships[0]?.refId
                }
            };
        }

        return {
            collection: 'ResourceTag',
            operation: 'find',
            filter
        };
    }

    buildUpdateQuery({ resourceType, resourceName, fields, relationships }) {
        const filter = { isDeleted: false };
        const update = { $set: { updatedAt: new Date() } };

        if (resourceType) filter.type = resourceType;
        if (resourceName) filter.name = resourceName;

        if (fields.length > 0) {
            update.$set['values'] = fields.map(f => ({
                fieldName: f.fieldName,
                value: f.value
            }));
        }

        if (relationships.length > 0) {
            update.$addToSet = {
                relationships: {
                    $each: relationships
                }
            };
        }

        return {
            collection: 'ResourceTag',
            operation: 'updateMany',
            filter,
            update
        };
    }

    buildDeleteQuery({ resourceType, resourceName }) {
        const filter = { isDeleted: false };

        if (resourceType) filter.type = resourceType;
        if (resourceName) filter.name = resourceName;

        return {
            collection: 'ResourceTag',
            operation: 'updateMany',
            filter,
            update: { $set: { isDeleted: true } }
        };
    }
}