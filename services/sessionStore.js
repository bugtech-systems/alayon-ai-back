import { db } from '../models/index.js';
import { internationalizePhoneNumber, sanitizePhoneNumber } from '../helpers/helpers.js';
import ResourceApiService from './ResourceApiService.js';


const sessions = new Map();

// Cleanup expired sessions every 5 minute
setInterval(() => {
    const now = Date.now();
    console.log(`[Session Cleanup] Running cleanup at ${new Date().toISOString()}`);
    let cleanupCount = 0;

    for (const [sessionId, session] of sessions) {
        if (now - session.lastAccessed > 30 * 60 * 1000) { // 30 minutes
            sessions.delete(sessionId);
            cleanupCount++;
            console.log(`[Session Cleanup] Removed expired session: ${sessionId}`);
        }
    }

    console.log(`[Session Cleanup] Removed ${cleanupCount} expired sessions`);
}, 5 * 60 * 1000);

export const sessionManager = {
    async createSession(id) {
        const sessionId = id || generateId();
        // const sessionId = 'session_420230'

        let conversation = await db.Conversation.create({
            session_id: sessionId
        });

        const session = {
            id: sessionId,
            results: [],
            context: {},
            pending: null,
            lastMessage: '',
            resourceName: null,
            resourceId: null,
            tenant_id: null,
            ai_preset_id: null,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min session
            history: [],
            status: 'followup',
            conversation_id: conversation.id
        };






        conversation.metadata = session;
        await conversation.save()
        sessions.set(sessionId, session);
        console.log(`[Session] Created new session: ${sessionId}`);
        return session;
    },

    async getSession(sessionId) {
        // console.log(`[Session] Looking up session: ${sessionId}`);
        let session = sessions.get(sessionId);

        // let session = conversation?.metadata;
        if (session && session?.id) {
            session.lastAccessed = Date.now();
            // console.log(`[Session] Session found: ${JSON.stringify(session, null, 2)}`);

            // let conversation = await db.Conversation.findOne({
            //     where: { session_id: sessionId, ai_preset_id: session.ai_preset_id },
            // });
        } else {
            console.log(`[Session] Session not found: ${sessionId}`);
            session = undefined
        }
        return session;
    },

    async updateSession(sessionId, updates) {

        // console.log(`[Session] Updating session ${sessionId} with: ${JSON.stringify(updates)}`);
        const session = this.getSession(sessionId);
        if (!session) {
            console.log(`[Session] Update failed - session not found: ${sessionId}`);
            return null;
        }

        Object.assign(session, updates);
        session.lastAccessed = Date.now();

        let newUpdates = { metadata: updates }
        if (updates.ai_preset_id) {
            newUpdates.ai_preset_id = updates.ai_preset_id
        }

        await db.Conversation.update(newUpdates, { where: { session_id: sessionId } })
        // console.log(`[Session] Updated session state: ${JSON.stringify(session, null, 2)}`);
        return session;
    },
    async handleMobileSubscription(mobile, org) {
        let userConfig = await ResourceApiService.getResourceTypeConfig('users', org)
        // console.log(`[Session] Updating session ${sessionId} with: ${JSON.stringify(updates)}`);
        let user = await db.ResourceTag.findOne({
            where: {
                resource_type: 'resource',
                resource_name: 'users',
                tenant_id: org,
                'attributes.phoneNumber': sanitizePhoneNumber(mobile),
                is_deleted: false
            }
        });
        console.log(user, 'STATE USER', mobile, sanitizePhoneNumber(mobile))
        if (!user) {
            user = await db.ResourceTag.create({
                resource_type: 'resource', resource_name: 'users',
                'attributes.phoneNumber': sanitizePhoneNumber(mobile),
                'attributes.isSubscribe': false,
                tenant_id: org,
                resource_parent_id: userConfig.id
            })

            console.log(`[Mobile] Subscription failed - session not found: ${mobile}`);
            // return user;
        }


        console.log(`[Session] Found  session state: ${JSON.stringify(user, null, 2)}`);
        return user;
    },


    async handleUpdateMobile(id, data, subscribe) {

        try {
            // Find the user
            const user = await db.ResourceTag.findByPk(id);

            if (!user) {
                console.log(`[Mobile] Subscription failed - user not found: ${id}`);
                return false;
            }

            // Prepare updates object
            const updates = {
                attributes: user.attributes,
                'attributes.isSubscribe': subscribe,
                'attributes.phoneNumber': sanitizePhoneNumber(user.attributes.phoneNumber),
            };

            // Conditionally add other fields if they exist in data
            const fieldsToUpdate = [
                'firstName',
                'lastName',
                'address_city',
                'address_barangay',
                'address_street'
            ];

            fieldsToUpdate.forEach(field => {
                if (data[field]) {
                    updates[`attributes.${field}`] = data[field];
                }
            });

            // Perform the update
            const [affectedCount] = await db.ResourceTag.update(updates, {
                where: { id: user.id }
            });

            if (affectedCount === 0) {
                console.log(`[Mobile] No records were updated for user: ${user.attributes.phoneNumber}`);
                return false;
            }

            console.log(`[Mobile] Successfully updated user: ${user.attributes.phoneNumber}`);
            return true;
        } catch (error) {
            console.error(`[Mobile] Error updating user ${user.attributes.phoneNumber}:`, error);
            return false;
        }
    },


    addHistory(sessionId, entry) {
        // console.log(`[Session] Adding history to ${sessionId}: ${JSON.stringify(entry)}`);
        const session = this.getSession(sessionId);
        if (session) {
            session.history.push({
                role: entry.role,
                content: entry.content,
                timestamp: new Date()
            });
            console.log(`[Session] History added. Total entries: ${session.history.length}`);
        }
    }
};

function generateId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}