// aiService.js
import contextManager from "./contextManager.js";
import { db } from "../config/db.js"; // drizzle db instance
import { aiPresets, messages } from "../db/schema.js";
import { OllamaClient } from "../utils/ollama-client.js";
import * as expressionEvaluator from "./expressionEvaluator.js";
import { cleanAndParseJSON, isJsonParsable, generateSessionId, generateExecutionId } from "../utils/helpers.js";
import { ActionEngine } from "./actionEngine.service.js";
import { eq, and, sql, or, ilike, asc, desc } from "drizzle-orm";


// Helper: assemble prompt with dynamic context
function buildPrompt(context, userMessage, history, system) {
  const ctx = JSON.stringify(context.parameters, null, 2);
  return `System Instruction: ${system}\nContext: ${ctx}\nHistory: \n${history}\n\nUSER: ${userMessage}`;
}

export class AIService {
  constructor(sessionId, model = "alayon") {
    this.sessionId = sessionId;
    this.treadId = generateSessionId();
    this.modelId = model;
    this.session = null;
    this.ollama = new OllamaClient();
    this.actionEngine = new ActionEngine();

    this.options = {
      temperature: 0.3,
      num_predict: 4096,
      top_p: 0.9,
      repeat_penalty: 1.1,
    };
  }

  async init() {
    this.session = await contextManager.getSession(this.sessionId);
    const { context, tenant_id: tenantId } = this.session;


    let presetWhere;
    if (/^\d+$/.test(this.modelId)) {
      // numeric id
      presetWhere = and(eq(aiPresets.id, Number(this.modelId)), tenantId ? eq(aiPresets.tenant_id, tenantId) : undefined);
    } else {
      presetWhere = and(eq(aiPresets.model_name, this.modelId), tenantId ? eq(aiPresets.tenant_id, tenantId) : undefined);
    }

    const modelData = await db
      .select()
      .from(aiPresets)
      .where(presetWhere)
      .limit(1);
      
      
      
    const model = modelData[0]
      
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

  async query(message, options) {
    if (!this.session) throw new Error("AIService not initialized. Call init() first.");
    let context = this.session.context;
      // const history = await db
      // .select()
      // .from(messages)
      // .where(
      //   and(
      //     eq(messages.conversation_id, this.session.conversation_id),
      //     eq(messages.ai_preset_id, this.session.ai_preset_id),
      //     or(eq(messages.role, "assistant"), eq(messages.role, "user")),
      //     eq(messages.name, 'history')
      //   )
      // )
      // .orderBy(asc(messages.created_at))
      // .limit(5);
      
    
      // console.log(this.session, 'SESSSH')
      const history = this.session.chats.filter(m => m.model == this.model.id).slice(0, 5);

      
  
      
      // const conversationHistory = [].map((m) => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n");
      const conversationHistory = history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
      const chatHistory = history.map((m) => ({role: m.role, content: m.content, }));


console.log(conversationHistory, 'CONVERSATION HISTORY')

          
    const prompt = buildPrompt(context, message, conversationHistory, options.systemInstructions || this.model.system_instruction);
    // if(options.systemInstructions){
    //     await this.saveMessage("system", options.systemInstructions, 1);
    // }

    // if(context && Object.keys(context).length){
    //         await this.saveMessage("context", JSON.stringify(context), 1);
    // }
    
    
    
    await this.saveMessage("user", message, 1);
    // await contextManager.addMessage(this.sessionId, 'user', message, this.model.id)

    await contextManager.addChat(this.sessionId, 'user', message, this.model.id)


// console.log(prompt, 'PROMPTT')

    const res = await this.ollama.generate(this.model.model_name, prompt, this.options);
    
    
      let sessionChat = await contextManager.addChat(this.sessionId, 'assistant', res.response, this.model.id)
      // console.log(sessionChat.chats, 'CHAATSSS', this.sessionId)
    return this.processResponse(res);
  }

  async generateTemplate(userInput, action) {
    const resolvedInput = expressionEvaluator.evaluatePlaceholders(userInput, this.session.context);

    const prompt = await this.buildTemplatePrompt(resolvedInput, {
      config: action.config,
      fields: action.parameters,
      name: action.name,
      id: action.id,
    });
    await this.saveMessage("user", resolvedInput, 1);

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
    const history = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, this.session.conversation_id),
          eq(messages.aiPresetId, this.session.ai_preset_id),
          or(eq(messages.role, "assistant"), eq(messages.role, "user")),
          eq(messages.name, 'history')
        )
      )
      .orderBy(asc(messages.createdAt))
      .limit(5);

    const params = {};
    const defaults = {};
    const fieldOptions = actionObject.fields.map((a) => {
      params[a.field_name] = `<${a.data_type}>`;
      defaults[a.field_name] = `${a.default_value}`;
      return { [a.field_name]: a.options };
    });

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

${fieldOptions.length ? `### FIELD OPTIONS\n${JSON.stringify(fieldOptions, null, 2)}` : ""}
`;

    const conversationHistory = history.map((m) => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n");

    const fullPrompt = `
${systemInstruction}

### CONTEXT
${JSON.stringify(this.session.context, null, 2)}

// ### CONVERSATION HISTORY
// ${conversationHistory}

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
}
