import { ResourceTag } from '../../models/resourceTag.model.js';
import mongoose from 'mongoose';


// 📂 services/queryExecutor.js
export class QueryExecutor {
    static async execute(query) {
        try {
            const collection = mongoose.connection.db.collection('resourcetags');
            const isConfig = query?.document?.type == 'config' ? true : false;
            switch (query.operation) {
                case 'insertOne':
                    return isConfig ? await this.handleInsertConfig(collection, query) : await this.handleInsertValues(collection, query);
                case 'find':
                    return await collection.find(query.filter).toArray();
                case 'updateMany':
                    return await collection.updateMany(query.filter, query.update);
                default:
                    throw new Error(`Unsupported operation: ${query.operation}`);
            }
        } catch (error) {
            console.error('Query execution failed:', error);
            throw error;
        }
    }

    static async handleInsertValues(collection, query) {
        // Alternative: Check for resources with same name and any matching values

        console.log(query, 'query values')
        const existingResources = await collection.find({
            name: query.document.name,
            type: query.document.type,
            isDeleted: false,
            $and: query.document.values.map(value => ({
                'values.fieldName': value.fieldName,
                'values.value': value.value
            }))
        }).toArray();

        if (existingResources.length > 0) {
            // Merge values from existing and new documents
            const mergedValues = this.mergeValues(existingResources[0].values, query.document.fields);

            return await collection.updateOne(
                { _id: existingResources[0]._id },
                {
                    $set: {
                        ...query.document,
                        values: mergedValues,
                        updatedAt: new Date()
                    }
                }
            );
        }

        return await collection.insertOne({ type: 'resource', ...query.document, fields: [] });
    }

    static async handleInsertConfig(collection, query) {
        // Alternative: Check for resources with same name and any matching values
        const existingResources = await collection.find({
            name: query.document.name,
            type: query.document.type,
            isDeleted: false,
            $or: query.document.fields.map(value => ({
                'fields.fieldName': value.fieldName,
                'fields.dataType': value.dataType,
                'fields.required': value.required,
            }))
        }).toArray();

        if (existingResources.length > 0) {
            // Merge values from existing and new documents
            const mergedValues = this.mergeValues(existingResources[0].fields, query.document.fields);

            return await collection.updateOne(
                { _id: existingResources[0]._id },
                {
                    $set: {
                        ...query.document,
                        fields: mergedValues,
                        updatedAt: new Date()
                    }
                }
            );
        }

        return await collection.insertOne({ ...query.document, values: [], type: 'config' });
    }

    static mergeValues(existingValues, newValues) {
        const merged = [...existingValues];

        newValues.forEach(newVal => {
            const existingIndex = merged.findIndex(v => v.fieldName === newVal.fieldName);
            if (existingIndex >= 0) {
                merged[existingIndex] = newVal; // Override
            } else {
                merged.push(newVal); // Add new
            }
        });

        return merged;
    }
}
