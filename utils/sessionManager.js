const sessions = new Map();

// Cleanup expired sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
        if (now - session.lastAccessed > 30 * 60 * 1000) { // 30 minutes
            sessions.delete(sessionId);
        }
    }
}, 60 * 1000);

export const sessionManager = {
    createSession() {
        const sessionId = generateId();
        const session = {
            id: sessionId,
            state: {
                operation: null,
                extractedFields: {},
                confirmed: false,
                query: null
            },
            history: [],
            createdAt: Date.now(),
            lastAccessed: Date.now()
        };
        sessions.set(sessionId, session);
        return session;
    },

    getSession(sessionId) {
        const session = sessions.get(sessionId);
        if (session) {
            session.lastAccessed = Date.now();
        }
        return session;
    },

    updateSession(sessionId, updates) {
        const session = this.getSession(sessionId);
        if (!session) return null;

        Object.assign(session.state, updates);
        session.lastAccessed = Date.now();
        return session;
    },

    addHistory(sessionId, entry) {
        const session = this.getSession(sessionId);
        if (session) {
            session.history.push({
                role: entry.role,
                content: entry.content,
                timestamp: new Date()
            });
        }
    }
};

function generateId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}