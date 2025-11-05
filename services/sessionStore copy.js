import { db } from '../models/index.js';
import { sanitizePhoneNumber } from '../helpers/helpers.js';
import ResourceApiService from './ResourceApiService.js';
import redis from '../services/redisClient.js';

const SESSION_TTL = 30 * 60; // 30 minutes in seconds

export const sessionManager = {
  async createSession(id) {
    const sessionId = id || generateId();

    const conversation = await db.Conversation.create({
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
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL * 1000).toISOString(),
      history: [],
      status: 'followup',
      conversation_id: conversation.id,
      lastAccessed: Date.now()
    };

    conversation.metadata = session;
    await conversation.save();

    await redis.setEx(`session:${sessionId}`, SESSION_TTL, JSON.stringify(session));
    console.log(`[Session] Created new session: ${sessionId}`);
    return session;
  },

  async getSession(sessionId) {
    if (!sessionId) return null;

    const data = await redis.get(`session:${sessionId}`);
    if (!data) {
      console.log(`[Session] Session not found in Redis: ${sessionId}`);
      return null;
    }

    const session = JSON.parse(data);
    session.lastAccessed = Date.now();

    // Extend TTL on access
    await redis.expire(`session:${sessionId}`, SESSION_TTL);
    return session;
  },

  async updateSession(sessionId, updates) {
    const data = await redis.get(`session:${sessionId}`);
    if (!data) {
      console.log(`[Session] Update failed - not found: ${sessionId}`);
      return null;
    }

    const session = { ...JSON.parse(data), ...updates, lastAccessed: Date.now() };

    // Save back to Redis with TTL reset
    await redis.setEx(`session:${sessionId}`, SESSION_TTL, JSON.stringify(session));

    // Sync updates to DB conversation metadata
    const newUpdates = { metadata: session };
    if (updates.ai_preset_id) newUpdates.ai_preset_id = updates.ai_preset_id;

    await db.Conversation.update(newUpdates, { where: { session_id: sessionId } });
    return session;
  },

  async addHistory(sessionId, entry) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    session.history.push({
      role: entry.role,
      content: entry.content,
      timestamp: new Date().toISOString()
    });

    await this.updateSession(sessionId, { history: session.history });
    console.log(`[Session] History added. Total entries: ${session.history.length}`);
    return session;
  },

  async handleMobileSubscription(mobile, org) {
    const userConfig = await ResourceApiService.getResourceTypeConfig('users', org);
    const phone = sanitizePhoneNumber(mobile);

    let user = await db.ResourceTag.findOne({
      where: {
        resource_type: 'resource',
        resource_name: 'users',
        tenant_id: org,
        'attributes.phoneNumber': phone,
        is_deleted: false
      }
    });

    if (!user) {
      user = await db.ResourceTag.create({
        resource_type: 'resource',
        resource_name: 'users',
        'attributes.phoneNumber': phone,
        'attributes.isSubscribe': false,
        tenant_id: org,
        resource_parent_id: userConfig.id
      });
      console.log(`[Mobile] Created new user for subscription: ${phone}`);
    }

    return user;
  },

  async handleUpdateMobile(id, data, subscribe) {
    try {
      const user = await db.ResourceTag.findByPk(id);
      if (!user) return false;

      const updates = {
        attributes: user.attributes,
        'attributes.isSubscribe': subscribe,
        'attributes.phoneNumber': sanitizePhoneNumber(user.attributes.phoneNumber)
      };

      const fieldsToUpdate = [ 'firstName', 'lastName', 'address_city', 'address_barangay', 'address_street' ];
      fieldsToUpdate.forEach(field => {
        if (data[field]) updates[`attributes.${field}`] = data[field];
      });

      const [affectedCount] = await db.ResourceTag.update(updates, { where: { id: user.id } });
      return affectedCount > 0;
    } catch (error) {
      console.error(`[Mobile] Error updating user ${id}:`, error);
      return false;
    }
  }
};

function generateId() {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}
