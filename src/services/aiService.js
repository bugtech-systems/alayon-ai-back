// aiService.js
import contextManager from "./contextManager.js";
import { db } from "../config/db.js"; // drizzle db instance
import { aiPresets, messages } from "../db/schema.js";
import { OllamaClient } from "../utils/ollama-client.js";
import * as expressionEvaluator from "./expressionEvaluator.js";
import { cleanAndParseJSON, isJsonParsable, generateSessionId, generateExecutionId } from "../utils/helpers.js";
import { ActionEngine } from "./actionEngine.service.js";
import { eq, and, sql, or, ilike, asc, desc } from "drizzle-orm";

// Helper: assemble prompt with dynamic context and conversation state
function buildPrompt(userMessage, history, system) {

console.log(history, 'HISTORYYYY')
  
  return `System Instructions: ${system}

Recent Conversation History: 
${history}

USER: ${userMessage}

ASSISTANT:`;
}

// Conversation state manager
class ConversationStateManager {
  constructor() {
    this.states = new Map();
  }

  getState(sessionId) {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, {
        currentIntent: null,
        currentFlow: null,
        collectedData: {},
        missingFields: [],
        currentStep: 0,
        lastResponse: null,
        conversationProgress: 0
      });
    }
    return this.states.get(sessionId);
  }

  updateState(sessionId, updates) {
    const state = this.getState(sessionId);
    this.states.set(sessionId, { ...state, ...updates });
    return this.getState(sessionId);
  }

  resetState(sessionId) {
    this.states.set(sessionId, {
      currentIntent: null,
      currentFlow: null,
      collectedData: {},
      missingFields: [],
      currentStep: 0,
      lastResponse: null,
      conversationProgress: 0
    });
  }
}

// Field extraction utilities
class FieldExtractor {
  static extractFields(message, currentState) {
    const lowerMessage = message.toLowerCase();
    const extracted = {};
    const detectedFields = [];

    // Extract delivery type
    if (!currentState.collectedData.delivery_type) {
      if (lowerMessage.includes('one-time') || lowerMessage.includes('single') || lowerMessage.includes('once')) {
        extracted.delivery_type = 'one-time';
        detectedFields.push('delivery_type');
      } else if (lowerMessage.includes('subscription') || lowerMessage.includes('regular') || lowerMessage.includes('weekly')) {
        extracted.delivery_type = 'subscription';
        detectedFields.push('delivery_type');
      }
    }

    // Extract water type
    if (!currentState.collectedData.water_type) {
      if (lowerMessage.includes('mineral')) {
        extracted.water_type = '5-gallon Mineral Water';
        detectedFields.push('water_type');
      } else if (lowerMessage.includes('purified')) {
        extracted.water_type = '5-gallon Purified Water';
        detectedFields.push('water_type');
      } else if (lowerMessage.includes('1-gallon') || lowerMessage.includes('1 gallon')) {
        extracted.water_type = '1-gallon Bottled Water';
        detectedFields.push('water_type');
      } else if (lowerMessage.includes('premium') || lowerMessage.includes('3-gallon')) {
        extracted.water_type = '3-gallon Premium Water';
        detectedFields.push('water_type');
      }
    }

    // Extract quantity
    if (!currentState.collectedData.bottle_quantity) {
      const quantityMatch = message.match(/\b(\d+)\b/);
      if (quantityMatch && parseInt(quantityMatch[1]) > 0) {
        extracted.bottle_quantity = quantityMatch[1];
        detectedFields.push('bottle_quantity');
      }
    }

    // Extract name
    if (!currentState.collectedData.customer_name) {
      const nameMatch = message.match(/(?:my name is|i'm|I am|ako si|pangalan ko)\s+([A-Za-z\s]+?)(?:\s|\.|$)/i);
      if (nameMatch) {
        extracted.customer_name = nameMatch[1].trim();
        detectedFields.push('customer_name');
      } else if (currentState.collectedData.bottle_quantity && currentState.collectedData.water_type) {
        // If we have quantity and water type, assume this might be the name
        extracted.customer_name = message.trim();
        detectedFields.push('customer_name');
      }
    }

    // Extract address
    if (!currentState.collectedData.delivery_address) {
      if (lowerMessage.includes('address') || lowerMessage.includes('deliver to') || lowerMessage.includes('street') || lowerMessage.includes('avenue')) {
        extracted.delivery_address = message.trim();
        detectedFields.push('delivery_address');
      } else if (currentState.collectedData.customer_name) {
        // If we have name, assume this might be the address
        extracted.delivery_address = message.trim();
        detectedFields.push('delivery_address');
      }
    }

    // Extract phone
    if (!currentState.collectedData.contact_phone) {
      const phoneMatch = message.match(/(09\d{9}|\+63\d{10}|\(\d{3}\)\s?\d{3}-\d{4})/);
      if (phoneMatch) {
        extracted.contact_phone = phoneMatch[1];
        detectedFields.push('contact_phone');
      }
    }

    // Extract delivery time
    if (!currentState.collectedData.preferred_time) {
      if (lowerMessage.includes('asap') || lowerMessage.includes('now')) {
        extracted.preferred_time = 'ASAP';
        detectedFields.push('preferred_time');
      } else if (lowerMessage.includes('today')) {
        extracted.preferred_time = 'Today';
        detectedFields.push('preferred_time');
      } else if (lowerMessage.includes('tomorrow') || lowerMessage.includes('bukas')) {
        extracted.preferred_time = 'Tomorrow';
        detectedFields.push('preferred_time');
      }
    }

    // Detect intents
    if (lowerMessage.includes('book') || lowerMessage.includes('order') || lowerMessage.includes('delivery')) {
      extracted.detectedIntent = 'booking';
    } else if (lowerMessage.includes('refer') || lowerMessage.includes('friend')) {
      extracted.detectedIntent = 'referral';
    } else if (lowerMessage.includes('product') || lowerMessage.includes('price')) {
      extracted.detectedIntent = 'products';
    } else if (lowerMessage.includes('delivery area') || lowerMessage.includes('coverage')) {
      extracted.detectedIntent = 'delivery_info';
    }

    return { extracted, detectedFields };
  }
}

// Flow progression manager
class FlowManager {
  static getNextStep(currentState, detectedFields) {
    const { collectedData, currentFlow } = currentState;
    
    if (currentFlow !== 'booking') {
      return { nextStep: 'welcome', progress: 0 };
    }

    const bookingFlow = [
      'delivery_type',
      'water_type', 
      'bottle_quantity',
      'customer_name',
      'delivery_address',
      'contact_phone',
      'preferred_time',
      'confirmation'
    ];

    // Find current position in flow
    let currentIndex = -1;
    for (let i = 0; i < bookingFlow.length; i++) {
      if (!collectedData[bookingFlow[i]]) {
        currentIndex = i;
        break;
      }
    }

    if (currentIndex === -1) {
      return { nextStep: 'confirmation', progress: 100 };
    }

    const progress = Math.round((currentIndex / bookingFlow.length) * 100);
    return { nextStep: bookingFlow[currentIndex], progress };
  }

  static generateResponse(nextStep, collectedData, conversationState) {
    const responses = {
      welcome: "Hello! Welcome to Alayon Water Delivery Service! 🌊 How can I help you today?",
      
      delivery_type: "Great! Let's get your water delivery scheduled. Are you looking for a one-time delivery or recurring subscription?",
      
      water_type: collectedData.delivery_type === 'one-time' 
        ? "Okay, one-time delivery! What type of water would you like? We have: 5-gallon Mineral Water (₱50), 5-gallon Purified Water (₱45), 1-gallon Bottled Water (₱25), 3-gallon Premium Water (₱120)"
        : "Excellent choice! Our subscriptions save you 15%. What type of water would you like? We have: 5-gallon Mineral Water (₱42), 5-gallon Purified Water (₱38), 1-gallon Bottled Water (₱21), 3-gallon Premium Water (₱102)",
      
      bottle_quantity: `Perfect! ${collectedData.water_type} selected. How many containers would you like?`,
      
      customer_name: `Got it! ${collectedData.bottle_quantity} container(s) of ${collectedData.water_type}. What's your full name for the delivery?`,
      
      delivery_address: `Salamat, ${collectedData.customer_name}! What's your complete delivery address? (Street, Barangay, City)`,
      
      contact_phone: `Noted! Delivery to ${collectedData.delivery_address}. What's your contact number for delivery updates?`,
      
      preferred_time: `Thank you! Contact number ${collectedData.contact_phone} recorded. When would you like your delivery? (ASAP, today, specific date/time)`,
      
      confirmation: FlowManager.generateOrderSummary(collectedData),
      
      referral: "🎉 REFER A FRIEND & EARN REWARDS! You get ₱100 credit, friend gets ₱50 off. Would you like to refer someone?",
      
      products: "💧 ALAYON PRODUCTS: 5-gal Mineral ₱50, 5-gal Purified ₱45, 1-gal Bottled ₱25, 3-gal Premium ₱120. What would you like to know more about?",
      
      delivery_info: "📍 DELIVERY AREAS: Cebu City, Mandaue, Lapu-Lapu, Talisay. Free delivery for orders ₱200+. Need specific area info?"
    };

    return responses[nextStep] || responses.welcome;
  }

  static generateOrderSummary(collectedData) {
    const total = FlowManager.calculatePrice(collectedData);
    return `ORDER SUMMARY 📝
• Name: ${collectedData.customer_name}
• Address: ${collectedData.delivery_address} 
• Phone: ${collectedData.contact_phone}
• Order: ${collectedData.bottle_quantity} × ${collectedData.water_type}
• Delivery: ${collectedData.preferred_time}
• Total: ₱${total}

Please reply CONFIRM to schedule your delivery!`;
  }

  static calculatePrice(collectedData) {
    const prices = {
      'mineral': 50,
      'purified': 45,
      '1-gallon': 25,
      'premium': 120
    };

    let basePrice = 50;
    Object.keys(prices).forEach(type => {
      if (collectedData.water_type?.toLowerCase().includes(type)) {
        basePrice = prices[type];
      }
    });

    const quantity = parseInt(collectedData.bottle_quantity) || 1;
    let total = basePrice * quantity;

    if (collectedData.delivery_type === 'subscription') {
      total *= 0.85;
    }

    if (total < 200) {
      total += 30;
    }

    return Math.round(total);
  }
}

export class AIService {
  constructor(sessionId, model = "alayon") {
    this.sessionId = sessionId;
    this.treadId = generateSessionId();
    this.modelId = model;
    this.session = null;
    this.ollama = new OllamaClient();
    this.actionEngine = new ActionEngine();
    this.conversationStateManager = new ConversationStateManager();

    this.options = { };
  }

  async init() {
    this.session = await contextManager.getSession(this.sessionId);
    const { context, tenant_id: tenantId } = this.session;

    let presetWhere;
    if (/^\d+$/.test(this.modelId)) {
      presetWhere = and(eq(aiPresets.id, Number(this.modelId)), tenantId ? eq(aiPresets.tenant_id, tenantId) : undefined);
    } else {
      presetWhere = and(eq(aiPresets.model_name, this.modelId), tenantId ? eq(aiPresets.tenant_id, tenantId) : undefined);
    }

    const modelData = await db
      .select()
      .from(aiPresets)
      .where(presetWhere)
      .limit(1);
      
    const model = modelData[0];
    this.model = context?.model ? { ...model, ...context.model } : model;

    if (!this.session.model) this.session.model = this.model;
    this.options = { ...this.options, ...(this.model?.parameters || {}) };
    this.session.ai_preset_id = this.model?.id;
    
    const executionId = generateExecutionId();
    const baseContext = {
      context,
      params: {},
      outputs: {},
      executionId,
    };

    if (this.model?.pre_hooks) {
      await this.actionEngine.processHooks(this.model.pre_hooks, baseContext);
    }

    return this;
  }

  async query(message, options = {}) {
    if (!this.session) throw new Error("AIService not initialized. Call init() first.");
    let context = this.session.context;

    // Get current conversation state
    // const conversationState = this.conversationStateManager.getState(this.sessionId);
    
    // Extract fields from user message
    // const { extracted, detectedFields } = FieldExtractor.extractFields(message, conversationState);
    
    // Update conversation state with extracted data
    // const updatedState = this.conversationStateManager.updateState(this.sessionId, {
    //   collectedData: { ...conversationState.collectedData, ...extracted },
    //   currentIntent: extracted.detectedIntent || conversationState.currentIntent,
    //   currentFlow: extracted.detectedIntent === 'booking' ? 'booking' : conversationState.currentFlow
    // });

    // Determine next step in conversation flow
    // const { nextStep, progress } = FlowManager.getNextStep(updatedState, detectedFields);
    
    // Generate appropriate response
    let response;
      // Use AI model for response generation
      const history = this.session.chats.filter(m => m.model == this.model.id).slice(0, 4);
      const conversationHistory = history.map((m) => `${m.role.toUpperCase()}: ${m.message}`).join("\n");
      
          const systemInstructions = await expressionEvaluator.resolvePlaceholders(
            this.model.system_instruction,
            options.context
          );
      
      
      const enhancedSystemInstruction = `
${options.systemInstructions ? 
`${systemInstructions}

IMPORTANT INSTRUCTIONS: ${options.systemInstructions}
` 
: 
systemInstructions
}

IMPORTANT: Continue the conversation naturally from the current step. Do not repeat previous questions.
`;




      const prompt = buildPrompt(
        message, 
        conversationHistory, 
        enhancedSystemInstruction,
        // updatedState
      );
      
      
    if(options.systemInstructions){
        await this.saveMessage("system", enhancedSystemInstruction, 1);
    }

    if(context?.parameters && Object.keys(context.parameters).length){
        await this.saveMessage("context", JSON.stringify(context.parameters), 1);
    }
    
    
    
      
      
      

      const aiResponse = await this.ollama.generate(this.model.model_name, prompt, this.options);
      response = aiResponse.response;

    // Update state with new response
    // this.conversationStateManager.updateState(this.sessionId, {
    //   currentStep: nextStep,
    //   conversationProgress: progress,
    //   lastResponse: response
    // });

    // Save messages
    await this.saveMessage("user", message, 1);
    await contextManager.addChat(this.sessionId, 'user', message, this.model.id);
    
    // await this.saveMessage("assistant", response, 1);
    await contextManager.addChat(this.sessionId, 'assistant', response, this.model.id);

      // console.log(prompt, 'PROMPTT', options)


    return this.processResponse(aiResponse);


  }

  getMissingFields(collectedData) {
    const requiredFields = ['delivery_type', 'water_type', 'bottle_quantity', 'customer_name', 'delivery_address', 'contact_phone', 'preferred_time'];
    return requiredFields.filter(field => !collectedData[field]);
  }

  async generateTemplate(userInput, action) {
    const resolvedInput = expressionEvaluator.evaluatePlaceholders(userInput, this.session.context);
    await this.saveMessage("user", resolvedInput, 1);

    const prompt = await this.buildTemplatePrompt(resolvedInput, {
      config: action.config,
      fields: action.parameters,
      name: action.name,
      id: action.id,
    });

    const rawResponse = await this.ollama.generate(this.model.modelName, prompt, this.options);
    return this.processResponse(rawResponse);
  }

  async generateAction(userInput, context) {
    const systemInstruction = this.model.systemPrompt || this.model.systemInstruction;
    const fullPrompt = `
${systemInstruction}

Context:
${JSON.stringify(context, null, 2)}

User Prompt:
${userInput}

Return ONLY a JSON object in the required schema.
`;

    const resolvedInput = expressionEvaluator.evaluatePlaceholders(fullPrompt, this.session.context);
    await this.saveMessage("context", JSON.stringify(this.session.context), 1);
    await this.saveMessage("user", userInput, 1);

    const rawResponse = await this.ollama.generate(this.model.model_name, resolvedInput, context);
    return this.processResponse(rawResponse);
  }

  async buildTemplatePrompt(userPrompt, actionObject) {
    // ... existing implementation ...
    const systemInstruction = `
### SYSTEM INSTRUCTIONS
Extract key-value pairs ONLY for fields in action.parameters.
- Identify and extract parameters object value from user prompts.
- Respect data_type strictly.
- If default_value is defined and no explicit value exists, use default_value.
- If options exist: match only exact values, else set null.
- Do not hallucinate or guess values.
- Fill placeholders in action.config with extracted values.
- Output JSON only.

### EXPECTED OUTPUT FORMAT
{
  "parameters": ${JSON.stringify(params, null, 2)},
  "template_output": ${JSON.stringify(actionObject.config, null, 2)}
}
`;

    const fullPrompt = `
${systemInstruction}

### CONTEXT
${JSON.stringify(this.session.context, null, 2)}

### USER PROMPT
${userPrompt}
`;

    await this.saveMessage("system", systemInstruction, 1);
    await this.saveMessage("context", JSON.stringify(this.session.context), 1);

    return fullPrompt;
  }

  async processResponse(data) {
    try {
      let response = isJsonParsable(data.response) ? cleanAndParseJSON(data.response) : data.response;

      const [assistantMessage] = await db
        .insert(messages)
        .values({
          role: "assistant",
          content: data.response,
          confidence_score: 0,
          tokens: data.eval_count,
          conversation_id: this.session.conversation_id,
          tread_id: this.treadId,
          ai_preset_id: this.session.ai_preset_id,
          tenant_id: this.model.tenant_id,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning();

      return { ...response, _confidence: 0 };
    } catch (error) {
      throw new Error(`Response validation failed: ${error.message}`);
    }
  }

  async saveMessage(role, content, confidence = null) {
    const normalizedRole = ["user", "system", "assistant"].includes(role) ? role : "assistant";

    const [message] = await db
      .insert(messages)
      .values({
        role: normalizedRole,
        name: ["user", "system", "assistant"].includes(role) ? null : role,
        content,
        confidence_score: confidence,
        conversation_id: this.session.conversation_id,
        tread_id: this.treadId,
        ai_preset_id: this.session.ai_preset_id,
        created_at: new Date(),
        updated_at: new Date(),
        tenant_id: this.model.tenant_id
      })
      .returning();

    return message;
  }

  // New method to get current conversation state 
  getConversationState() {
    return this.conversationStateManager.getState(this.sessionId);
  }

  // New method to reset conversation
  resetConversation() {
    this.conversationStateManager.resetState(this.sessionId );
    return { success: true, message: "Conversation reset" };
  }
}