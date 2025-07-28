import { where } from 'sequelize';
import { db } from '../models/index.js';


const sessions = new Map();

// Cleanup expired sessions every minute
// setInterval(() => {
//     const now = Date.now();
//     console.log(`[Session Cleanup] Running cleanup at ${new Date().toISOString()}`);
//     let cleanupCount = 0;

//     for (const [sessionId, session] of sessions) {
//         if (now - session.lastAccessed > 30 * 60 * 1000) { // 30 minutes
//             sessions.delete(sessionId);
//             cleanupCount++;
//             console.log(`[Session Cleanup] Removed expired session: ${sessionId}`);
//         }
//     }

//     console.log(`[Session Cleanup] Removed ${cleanupCount} expired sessions`);
// }, 60 * 1000);

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
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min session
            history: [],
            status: 'followup',
            conversation_id: conversation.id
        };



        console.log(conversation, 'connvv')
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
        console.log(session, 'sss')
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
        console.log(session, 'sesss')
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