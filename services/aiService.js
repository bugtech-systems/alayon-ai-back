// aiService.js
import contextManager from "./contextManager1.js";
import { db } from '../models/index.js';
import { OllamaClient } from '../helpers/ollama-client.js';
import * as expressionEvaluator from './expressionEvaluator.js';
import { Op } from 'sequelize';
import { cleanAndParseJSON, isJsonParsable, generateSessionId, generateExecutionId } from '../helpers/helpers.js';
import buildPrompt from "./promptBuilder.js";
import { ActionEngine } from "./ActionEngine.js";



export class AIService {
  constructor(sessionId, model = "alayon") {
    this.sessionId = sessionId;
    this.treadId = generateSessionId();
    this.modelId = model;
    this.session = null; // will be loaded on init
    this.ollama = new OllamaClient();
    this.actionEngine = new ActionEngine();
    
   this.options = {
            temperature: 0.3,
            num_predict: 4096,
            top_p: 0.9,
            repeat_penalty: 1.1
        }
  }

  async init() {
    this.session = await contextManager.getSession(this.sessionId);
    let context = this.session.context;
    let tenantId = this.session.tenant_id;
       let options = {}

        if (Number.isInteger(this.modelId) || /^\d+$/.test(this.modelId)) {
            // If identifier is a number, use it directly as parent ID
            options = { id: this.modelId, ...(tenantId ? { tenant_id: tenantId } : {}) }
        } else {
            options = { model_name: this.modelId, ...(tenantId ? { tenant_id: tenantId } : {}) }
        }


        let model = await db.AiPreset.findOne({ where: options });
        if (context && context?.model) {
            this.model = { ...model, ...context?.model };
        } else {
            this.model = model;
        }

    // fallback model if not in context
    if (!this.session.model) {
      this.session.model = this.model;
    }
    
    this.options = {...this.options, ...model.parameters}
    
    
    this.session.ai_preset_id = model?.id;
    
    
            let executionId = generateExecutionId();
    
            const baseContext = {
                context,
                params: {},
                outputs: {},
                executionId: executionId
            };
    
    
    
            if (model.pre_hooks) {
                await this.actionEngine.processHooks(model.pre_hooks, baseContext);
            }
    
            // this.session.context = baseContext.outputs
    
    
    await contextManager.addSessionState(this.sessionId, {ai_preset_id: model?.id});
    // await contextManager.addContext(this.sessionId, {...baseContext});
    return this;
  }

  async query(message, options) {
  
    if (!this.session) {
      throw new Error("AIService not initialized. Call init() first.");
    }
    
    
            const baseContext = {
                params: {},
                outputs: {},
                ...this.session.context
            }
    
    
    
            const resolvedInstructions = expressionEvaluator.evaluatePlaceholders(
              this.model.system_prompt || this.model.system_instruction,
                baseContext
            );
    
    

    // Build dynamic prompt
    const prompt = buildPrompt({
      ...options,
     systemInstructions: resolvedInstructions,
     context: {...options.context, ...this.session.context},
      message
    });
    
        await this.saveMessage('user', message, 1);
    
    
    
    const res = await this.ollama.generate(this.session.model.model_name || this.modelId, prompt, this.options);





  /*   const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.session.context.model || this.modelId,
        prompt,
        stream: false
      })
    }); */

  /*   if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }
 */


  
    const response = await this.processResponse(res);


    return response;
  }
  
  async generateTemplate(userInput, action) {
    const resolvedInput = expressionEvaluator.evaluatePlaceholders(
      userInput,
      this.session.context
    );

console.log(resolvedInput, 'input action')

    const prompt = await this.buildTemplatePrompt(resolvedInput, { config: action.config, fields: action.parameters, name: action.name, id: action.id });
    await this.saveMessage('user', resolvedInput, 1);


    const rawResponse = await this.ollama.generate(this.model.model_name, prompt, this.options);

    const response = await this.processResponse(rawResponse);

    return response;
  }
  
    async generateAction(userInput, context) {
    
    console.log(this.model, 'MODEL ACTION');
    let systemInstruction = this.model.system_prompt || this.model.system_instruction;
    
    
  const fullPrompt = `
${systemInstruction}

Context:
${JSON.stringify(context, null, 2)}

User Prompt:
${userInput}

Return ONLY a JSON object in the required schema.
`;
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    const resolvedInput = expressionEvaluator.evaluatePlaceholders(
      fullPrompt,
      this.session.context
    );

console.log(resolvedInput, 'input action')

    
        // Save the context + prompt for fine-tuning
    // await this.saveMessage('system', systemInstruction, 1);
    await this.saveMessage('context', JSON.stringify(this.session.context), 1);
    await this.saveMessage('user', userInput, 1);


    const rawResponse = await this.ollama.generate(this.model.model_name, resolvedInput, context);




    const response = await this.processResponse(rawResponse);

    return response;
  }


  async buildTemplatePrompt(userPrompt, actionObject) {
    // Get conversation history
    const history = await db.Message.findAll({
      where: {
        conversation_id: this.session.conversation_id,
        ai_preset_id: this.session.ai_preset_id,
        role: { [Op.or]: ['assistant', 'user'] },
        name: { [Op.is]: null },
      },
      order: [['created_at', 'ASC']],
      limit: 5,
      raw: true,
    });

    const params = {};
    const defaults = {};
        let fieldOptions = actionObject.fields.map(a => {
            params[a.field_name] = `<${a.data_type}>`;
            defaults[a.field_name] = `${a.default_value}`;
            return ({ [a.field_name]: a.options })
        })

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

${fieldOptions.length ? `### FIELD OPTIONS\n${JSON.stringify(fieldOptions, null, 2)}` : ''}
    `;



    let conversationHistory = history
      .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n');

    const fullPrompt = `
${systemInstruction}

### CONTEXT
${JSON.stringify(this.session.context, null, 2)}

// ### CONVERSATION HISTORY
// ${conversationHistory}

### USER PROMPT
${userPrompt}
`; 




    // Save the context + prompt for fine-tuning
    await this.saveMessage('system', systemInstruction, 1);
    await this.saveMessage('context', JSON.stringify(this.session.context), 1);

    return fullPrompt;
  }

  async processResponse(data) {
    try {
      let response;
      if (isJsonParsable(data.response)) {
        response = cleanAndParseJSON(data.response);
      } else {
        response = data.response;
      }

      const assistantMessage = await this.saveMessage('assistant', data.response, 0);
      assistantMessage.tokens = data.eval_count;
      assistantMessage.save();

      return { ...response, _confidence: 0 };
    } catch (error) {
      throw new Error(`Response validation failed: ${error.message}`);
    }
  }

  async saveMessage(role, content, confidence = null) {
    let normalizedRole =
      role !== 'user' && role !== 'system' && role !== 'assistant'
        ? 'assistant'
        : role;
console.log(this.session.ai_preset_id, 'preset id')
    return await db.Message.create({
      role: normalizedRole,
      name: role !== 'user' && role !== 'system' && role !== 'assistant' ? role : null,
      content,
      confidence_score: confidence,
      conversation_id: this.session.conversation_id,
      treadId: this.treadId,
      ai_preset_id: this.session.ai_preset_id,
    });
  }

  
}
