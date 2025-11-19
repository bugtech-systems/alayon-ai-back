// src/services/contextManager.js
import { createClient } from "redis";
import { db } from "../config/db.js";
import { conversations, resourceTags } from "../db/schema.js";
import { sanitizePhoneNumber } from "../utils/helpers.js";
import ResourceApiService from "./resourceApi.service.js";
import { eq, sql } from "drizzle-orm";

const redis = createClient({ url: "redis://localhost:6379" });
redis.on("error", (err) => console.error("Redis Client Error", err));
await redis.connect();

export function generateId() {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

class ContextManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.expirer();
  }

  expirer() {
    setInterval(() => {
      console.log(`[Session Cleanup] ${new Date().toISOString()}`);
      this.clearAllSessions();
    }, 15 * 60 * 1000);
  }

  async clearAllSessions() {
    for await (const key of this.redis.scanIterator({ MATCH: "session:*" })) {
      await this.redis.del(key);
    }
    console.log("✅ All sessions cleared");
  }

  async getSession(id, tenantId) {
    const sessionId = id && id != "undefined" ? id : generateId();
    let session = await this.redis.get(`session:${sessionId}`);


    let conversation;
    let data;
    let newSession = JSON.parse(session)
        
        const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.session_id, id));
         
         conversation = rows[0];
    
    
  
    if ((!session || !newSession.conversation_id || !conversation)) {
      [conversation] = await db
        .insert(conversations)
        .values({ 
          session_id: sessionId,   
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning();
        
      data = { session_id: sessionId, history: [], chats: [], context: {}, conversation_id: conversation?.id, tenant_id: tenantId } 
    } else {

    
    data = { ...newSession, session_id: sessionId, conversation_id: conversation?.id, tenant_id: tenantId }
    }

      this.saveSession(sessionId, data)      
     
    return data
  }

  async saveSession(session_id, session) {

    await this.redis.set(`session:${session_id}`, JSON.stringify(session));
  }

 async addMessage(session_id, role, content, model) {
  const session = await this.getSession(session_id);
  
  // Ensure we only keep the last 4 messages before adding the new one
  const MAX_HISTORY = 5;
  if (session.history.length >= MAX_HISTORY) {
    // Remove the oldest message(s) to make room for the new one
    const messagesToKeep = MAX_HISTORY - 1;
    session.history = session.history.slice(-messagesToKeep);
  }
  
  session.history.push({ role, content, model });
  await this.saveSession(session_id, session);
}

 async addChat(session_id, role, message, model) {
  const session = await this.getSession(session_id);
  
  // Ensure we only keep the last 4 messages before adding the new one
  const MAX_HISTORY = 20;
  if (session.chats.length >= MAX_HISTORY) {
    // Remove the oldest message(s) to make room for the new one
    const messagesToKeep = MAX_HISTORY - 1;
    session.chats = session.chats.slice(-messagesToKeep);
  }
  
  session.chats.push({ role, message, model });
  await this.saveSession(session_id, session);
  return session;
}



  async addContext(session_id, newContext) {
    const session = await this.getSession(session_id);
    session.context = { ...session.context, ...newContext };
    await this.saveSession(session_id, session);
    return session.context;
  }
  
  async saveContext(session_id, newContext) {
  
    const session = await this.getSession(session_id);

    session.context = { ...session.context, ...newContext };
    await this.saveSession(session_id, session);
    return session.context;
  }

  async addSessionState(session_id, newState) {
    const session = await this.getSession(session_id);
    Object.assign(session, newState);
    session.last_accessed = Date.now();

    // const updateData = { metadata: newState };
    // if (newState.ai_preset_id) updateData.ai_preset_id = newState.ai_preset_id;

    // await db
    //   .update(conversations)
    //   .set(updateData)
    //   .where(eq(conversations.session_id, session_id));
    await this.saveSession(session_id, session);
    return session;
  }

  async clearSession(session_id) {
    await this.redis.del(`session:${session_id}`);
  }

  async handleMobileSubscription(mobile, org) {
    const userConfig = await ResourceApiService.getResourceTypeConfig("users", org);
    const clean = sanitizePhoneNumber(mobile);

    const rows = await db
      .select()
      .from(resourceTags)
      .where(
        sql`${resourceTags.attributes} ->> 'phoneNumber' = ${clean}
             AND ${resourceTags.resource_name} = 'users'
             AND ${resourceTags.resource_type} = 'resource'
             AND ${resourceTags.is_deleted} = false`
      );

    let user = rows[0];

    if (!user) {
      [user] = await db
        .insert(resourceTags)
        .values({
          resource_type: "resource",
          resource_name: "users",
          attributes: { phoneNumber: clean, is_subscribe: false },
          tenant_id: org,
          resource_parent_id: userConfig.id,
          is_deleted: false,
        })
        .returning();
      console.log(`[Mobile] Created unsubscribed user for ${mobile}`);
    }

    return user;
  }

  async handleUpdateMobile(id, data, subscribe = false) {
    try {
      const rows = await db
        .select()
        .from(resourceTags)
        .where(eq(resourceTags.id, id));

      let user = rows[0];
      if (!user) {
        console.log(`[Mobile] User not found: ${id}`);
        return false;
      }

      let updatedAttrs = {
        ...user.attributes,
        is_subscribe: subscribe,
        phoneNumber: sanitizePhoneNumber(user.attributes.phoneNumber),
      };

      ["first_name", "last_name", "address"].forEach((f) => {
        if (data[f]) updatedAttrs[f] = data[f];
      });

      await db
        .update(resourceTags)
        .set({ attributes: updatedAttrs })
        .where(eq(resourceTags.id, id));

      console.log(`[Mobile] Updated user ${updatedAttrs.phoneNumber}`);
      return true;
    } catch (err) {
      console.error("[Mobile] Update failed", err);
      return false;
    }
  }
}

const contextManager = new ContextManager(redis);
export default contextManager;
