import { Session } from '../models/Session.js';
import mongoose from "mongoose";

export const sessionStore = {


    async initSession(sessionId) {
        const session = new Session({
            name: 'session',
            action: 'created',
            state: {
                collectedData: {},
                confirmed: false
            },
            notes: 'New session initialized'
        });
        await session.save();
        return session.toObject();
    },

    async getSession(sessionId) {
        const isValid = mongoose.isValidObjectId(sessionId);
        if (!isValid) return null

        const session = await Session.findById(sessionId).lean();

        return session?.state ? session : null;
    },

    async updateSession(sessionId, updates) {
        const currentState = await this.getSession(sessionId) ||
            await this.initSession(sessionId);

        const newState = {
            ...currentState.state,
            ...updates
        };


        console.log(newState, updates, 'UOPPPSS')
        currentState.state = newState;
        let updated = await Session.findByIdAndUpdate(sessionId, { state: newState }, { new: true });


        console.log(updated, 'UPPDDTATE', sessionId, updates)


        // await currentState.save();
        return updated.toObject();
    },

    async logOperation(sessionId, operationData) {
        const touchpoint = new Session({
            name: 'crud-operation',
            action: operationData.action,
            resourceId: operationData.resourceId,
            values: operationData.values,
            notes: operationData.notes
        });
        await touchpoint.save();
        return touchpoint.toObject();
    }
};