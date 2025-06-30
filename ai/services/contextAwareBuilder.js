// 📂 services/contextAwareQueryBuilder.js
import { ResourceTag } from '../../models/resourceTag.model.js';
import mongoose from 'mongoose';

export class ContextAwareQueryBuilder {
    constructor() {
        // Proper initialization
        this.resetContext();
    }

    resetContext() {
        this.context = {
            currentSubject: null,
            pendingOperation: null,
            missingFields: [],
            identifiedResources: []
        };
    }

    extractBasicInfo(prompt) {
        if (!prompt) return {};

        const typeMatch = prompt.match(/(resource|config|connections)/i);
        const nameMatch = prompt.match(/named\s+['"]?([^'"\s]+)['"]?/i);

        return {
            resourceType: typeMatch?.[1]?.toLowerCase() || 'resource',
            resourceName: nameMatch?.[1]
        };
    }
    async processPrompt(prompt, providedData = []) {
        try {
            // Validate context exists
            if (!this.context) {
                this.resetContext();
            }

            // Process provided data
            if (providedData && providedData.length > 0) {
                this.context.currentSubject = Array.isArray(providedData)
                    ? providedData[0]
                    : providedData;
            }

            const intent = this.determineIntent(prompt);
            const { resourceType, resourceName } = this.extractBasicInfo(prompt);

            // Store in context
            this.context.pendingOperation = intent;
            this.context.resourceType = resourceType;
            this.context.resourceName = resourceName;

            // Rest of your processing...

        } catch (error) {
            console.error('Process prompt error:', error);
            throw error;
        }
    }
    determineIntent(prompt) {
        const lowerPrompt = prompt.toLowerCase();
        if (lowerPrompt.includes('create') || lowerPrompt.includes('add')) return 'create';
        if (lowerPrompt.includes('update') || lowerPrompt.includes('modify')) return 'update';
        if (lowerPrompt.includes('delete') || lowerPrompt.includes('remove')) return 'delete';
        return 'find';
    }

    async handleCreate(prompt) {
        const { resourceType, resourceName } = this.extractBasicInfo(prompt);

        if (!this.context.currentSubject) {
            this.context.missingFields = this.getRequiredFields('create');
            return {
                status: 'missing_info',
                requiredFields: this.context.missingFields
            };
        }

        return {
            operation: 'insertOne',
            document: {
                ...this.context.currentSubject,
                type: resourceType,
                name: resourceName || `auto-${Date.now()}`,
                isDeleted: false,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        };
    }

    async handleFind(prompt) {
        const filter = { isDeleted: false };
        const { resourceType, resourceName } = this.extractBasicInfo(prompt);

        if (resourceType) filter.type = resourceType;
        if (resourceName) filter.name = resourceName;

        // Add conditions from previous context
        if (this.context.identifiedResources.length > 0) {
            filter._id = { $in: this.context.identifiedResources };
        }

        // Extract field filters from prompt
        const fieldConditions = this.extractFieldConditions(prompt);
        if (fieldConditions.length > 0) {
            filter.$and = fieldConditions;
        }

        return {
            operation: 'find',
            filter
        };
    }

    async handleUpdate(prompt) {
        if (!this.context.currentSubject) {
            // Try to identify resources to update from prompt
            const resourceIds = this.extractResourceIds(prompt);

            if (resourceIds.length > 0) {
                this.context.identifiedResources = resourceIds;
                return {
                    status: 'need_update_data',
                    identifiedResources: resourceIds
                };
            }

            this.context.missingFields = ['updateData', 'targetResources'];
            return {
                status: 'missing_info',
                requiredFields: this.context.missingFields
            };
        }

        const updateDoc = {
            $set: {
                ...this.context.currentSubject,
                updatedAt: new Date()
            }
        };

        let filter = { isDeleted: false };
        if (this.context.identifiedResources.length > 0) {
            filter._id = { $in: this.context.identifiedResources };
        } else {
            // Fallback to updating based on current subject
            filter = this.buildFilterFromSubject(this.context.currentSubject);
        }

        return {
            operation: 'updateMany',
            filter,
            update: updateDoc
        };
    }

    async handleDelete(prompt) {
        const resourceIds = this.extractResourceIds(prompt);

        if (resourceIds.length > 0) {
            return {
                operation: 'updateMany', // Soft delete
                filter: { _id: { $in: resourceIds } },
                update: { $set: { isDeleted: true } }
            };
        }

        // Try to identify from context
        if (this.context.identifiedResources.length > 0) {
            return {
                operation: 'updateMany',
                filter: { _id: { $in: this.context.identifiedResources } },
                update: { $set: { isDeleted: true } }
            };
        }

        this.context.missingFields = ['targetResources'];
        return {
            status: 'missing_info',
            requiredFields: this.context.missingFields
        };
    }

    // Helper methods
    processInputData(dataArray, intent) {
        if (intent === 'create') {
            return dataArray[0]; // For create, use first object
        }
        return dataArray; // For update/find, use entire array
    }

    extractResourceIds(prompt) {
        const idRegex = /[0-9a-fA-F]{24}/g;
        return prompt.match(idRegex) || [];
    }

    buildResponse(query, intent) {
        const baseResponse = {
            intent,
            timestamp: new Date(),
            query,
            context: { ...this.context }
        };

        if (query.status === 'missing_info') {
            return {
                ...baseResponse,
                followup: this.generateFollowupQuestion(intent),
                confirm: false
            };
        }

        return {
            ...baseResponse,
            followup: null,
            confirm: intent !== 'find'
        };
    }

    generateFollowupQuestion(intent) {
        const questions = {
            create: `Please provide the resource data to create. Required fields: ${this.context.missingFields.join(', ')}`,
            update: `Which resources should be updated? Please provide IDs or search criteria.`,
            delete: `Which resources should be deleted? Please provide IDs or search criteria.`,
            find: `What specific resources are you looking for?`
        };
        return questions[intent];
    }
}