import { createClient } from "redis";
import { db } from '../models/index.js';
import { internationalizePhoneNumber, sanitizePhoneNumber } from '../helpers/helpers.js';
import ResourceApiService from './ResourceApiService.js';


const redis = createClient({ url: "redis://localhost:6379" });
redis.on("error", (err) => console.error("Redis Client Error", err));
await redis.connect();

function generateId() {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}




class ContextManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.expirer()
  }
  
  async expirer() {
  console.log("EXPIRER")
  setInterval(() => {
    const now = Date.now();
    console.log(`[Session Cleanup] Running cleanup at ${new Date().toISOString()}`);
    let cleanupCount = 0;

    this.clearAllSessions()

    console.log(`[Session Cleanup] Removed ${cleanupCount} expired sessions`);
}, 60 * 60 * 1000);
  
  }
  
  async clearAllSessions() {
  for await (const key of this.redis.scanIterator({ MATCH: "session:*" })) {
    await this.redis.del(key);
  }
  console.log("✅ All sessions cleared");
}

  async getSession(id) {
           const sessionId = (id && id != 'undefined') ?  id : generateId();

      
   
    const data = await this.redis.get(`session:${sessionId}`);
    
    let conversation;
    if(!data){
         conversation = await db.Conversation.create({
            session_id: sessionId
        });
    }  else {
                conversation = await db.Conversation.findOne({
                where: { session_id: sessionId, ...(data.ai_preset_id ? {ai_preset_id: data.ai_preset_id} : {}) },
            });
            }
  
    return data ? JSON.parse(data) : { id: sessionId, history: [], context: {}, conversation_id: conversation?.id};
  }

  async saveSession(sessionId, session) {
    await this.redis.set(`session:${sessionId}`, JSON.stringify(session));
  }

  async addMessage(sessionId, role, content) {
    const session = await this.getSession(sessionId);
    session.history.push({ role, content });
    await this.saveSession(sessionId, session);
  }

  async addContext(sessionId, newContext) {
    const session = await this.getSession(sessionId);
    session.context = { ...session.context, ...newContext };
    await this.saveSession(sessionId, session);
    
    return session.context;
  }
  
    async addSessionState(sessionId, newState) {
    const session = await this.getSession(sessionId);
    
    
      Object.assign(session, newState);
        session.lastAccessed = Date.now();

        let newUpdates = { metadata: newState }
        if (newState.ai_preset_id) {
            newUpdates.ai_preset_id = newState.ai_preset_id
        }
        
        
        

        await db.Conversation.update(newUpdates, { where: { session_id: sessionId } })
    
    
    await this.saveSession(sessionId, session);
    
    return session;
  }

  async clearSession(sessionId) {
    await this.redis.del(`session:${sessionId}`);
  }
  
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
      }
  
  
      async handleUpdateMobile(id, data, subscribe = false) {
          try {
              // Find the user
              let user = await db.ResourceTag.findByPk(id);
  
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
                  'address'
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
              console.error(`[Mobile] Error updating user:`, error);
              return false;
          }
      }
  
}

const contextManager = new ContextManager(redis);
export default contextManager;
