class Session {
    constructor(id) {
        this.id = id;
        this.history = [];
        this.results = [];
        this.organization = null;
        this.resourceName = null;
        this.resourceType = null;
        this.partialData = {};
        this.confirmedFields = [];
        this.latestQuery = null;
        this.latestData = null;
        this.createdAt = new Date();
        this.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min session

        console.log(`[SESSION] New session created: ${id}`);
    }

    touch() {
        this.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        console.log(`[SESSION] Extended session: ${this.id}`);
    }

    toJSON() {
        return {
            id: this.id,
            history: this.history.length,
            dataFields: Object.keys(this.partialData),
            expiresIn: Math.round((this.expiresAt - new Date()) / 60000) + ' minutes'
        };
    }
}

const sessions = new Map();

export const createSession = (id) => {
    if (sessions.has(id)) {
        console.warn(`[SESSION] Already exists: ${id}`);
        return sessions.get(id);
    }
    const session = new Session(id);
    sessions.set(id, session);
    return session;
};

export const getSession = (id) => {
    const session = sessions.get(id);
    if (!session) {
        console.warn(`[SESSION] Not found: ${id}`);
        return null;
    }
    if (session.expiresAt < new Date()) {
        console.log(`[SESSION] Expired: ${id}`);
        sessions.delete(id);
        return null;
    }
    session.touch();
    return session;
};

// Cleanup job
setInterval(() => {
    const now = new Date();
    let count = 0;
    sessions.forEach((session, id) => {
        if (session.expiresAt < now) {
            sessions.delete(id);
            count++;
        }
    });
    console.log(`[CLEANUP] Removed ${count} expired sessions`);
}, 60 * 60 * 1000); // Hourly