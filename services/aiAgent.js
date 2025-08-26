import { db } from '../models/index.js';
import { OllamaClient } from '../helpers/ollama-client.js';

import { ActionEngine } from '../services/ActionEngine.js';
import { cleanAndParseJSON, generateFromSchema, isJsonParsable, generateExecutionId, generateFieldTypeMap, generateSessionId } from '../helpers/helpers.js';
import * as expressionEvaluator from './expressionEvaluator.js';
import { resolveConfig, resolveParameters, resolvePlaceholders } from '../helpers/parameterResolver.js';

import { ModelDeployer } from '../services/model-deployer.js';
import { Op } from 'sequelize';



export class AIAgent {
    constructor(modelId, sessionId) {
        this.modelId = modelId;
        this.sessionId = sessionId;
        this.treadId = generateSessionId();
        this.action = null;
        this.history = [];
        this.context = {};
        this.options = {
            temperature: 0.3,
            num_predict: 4096,
            top_p: 0.9,
            repeat_penalty: 1.1
        }
        this.ollama = new OllamaClient();
        this.actionEngine = new ActionEngine();

    }

    async initialize(context, tenantId) {
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



        if (!this.model) throw new Error(`Model ${this.modelId} not found`);
        // Create execution context


        [this.conversation] = await db.Conversation.findOrCreate({
            where: { id: this.sessionId }
        });

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

        this.context = baseContext
        this.history = [];

    }

    async initializeAction(context, actionId) {
        let options = {}



        if (Number.isInteger(actionId) || /^\d+$/.test(actionId)) {
            // If identifier is a number, use it directly as parent ID
            options = { id: actionId }
        } else {
            options = { name: actionId }
        }


        let action = await db.ActionTemplate.findOne({ where: options });
        if (action) {
            this.action = action;
        }



        if (!action) throw new Error(`Action ${this.modelId} not found`);

        let model = await db.AiPreset.findByPk(action.ai_preset_id);
        if (context && context?.model) {
            this.model = { ...model, ...context?.model };
        } else {
            this.model = model;
        }

        if (!this.model) throw new Error(`Model ${this.modelId} not found`);
        // Create execution context



        // Create execution context
        [this.conversation] = await db.Conversation.findOrCreate({
            where: { id: this.sessionId }
        });

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

        if (action.pre_hooks) {
            await this.actionEngine.processHooks(action.pre_hooks, baseContext);
        }



        this.context = baseContext;

    }

    async generate(userInput, options) {
        // Save user message




        const baseContext = {
            params: {},
            outputs: {},
            ...this.context
        }


        const resolvedInput = expressionEvaluator.evaluatePlaceholders(
            userInput,
            baseContext
        );





        let userMessage = await this.saveMessage('user', resolvedInput, 1);

        const messages = await this.buildMessages();


        let newOptions = { ...this.options, ...this.model.parameters, ...options }


        let newMessages = messages.map(a => ({ ...a, content: typeof a.content != 'string' ? JSON.stringify(a.content) : a.content }))


        const rawResponse = await this.ollama.chat(
            this.model.model_name,
            newMessages,
            { ...newOptions, num_predict: newOptions.num_ctx }
        );


        let response = await this.processResponse(rawResponse)


        userMessage.confidence_score = response._confidence;
        // userMessage.is_training_candidate = response._confidence >= this.model.min_fine_tune_confidence
        userMessage.tokens = rawResponse.prompt_eval_count
        userMessage.save()
        return response;
    }

    async generateAlayon(userInput, context) {
        // Save user message



        const history = await db.Message.findAll({
            where: {
                conversation_id: this.conversation.id, role: { [Op.or]: ["assistant", "user"] }, name: {
                    [Op.is]: null
                }
            },
            order: [['created_at', 'ASC']],
            limit: 5, // Last 5 exchanges
            raw: true
        });


        const resolvedInput = expressionEvaluator.evaluatePlaceholders(
            userInput,
            context
        );


        let systemPrompt = await this.buildSystemPrompt();





        let messages = [
            { role: 'system', content: systemPrompt },
            // ...history,
            { role: 'user', content: `##CONTEXT: ${JSON.stringify(context, null, 2)}\n\n ##PROMPT: ${resolvedInput}` },
        ];







        let newMessages = messages.map(a => ({ ...a, content: typeof a.content != 'string' ? JSON.stringify(a.content) : a.content }))


        console.log('GENERATE ALAYON MESSAGES', newMessages)


        let newOptions = { ...this.options, ...this.model.parameters }

        const rawResponse = await this.ollama.chat(
            this.model.model_name,
            newMessages,
            { ...newOptions, num_predict: newOptions.num_ctx }
        );



        // await this.saveMessage('action_context', JSON.stringify(context, null, 2), 1);

        let userMessage = await this.saveMessage('user', resolvedInput, 1);

        let response = await this.processResponse(rawResponse)


        userMessage.confidence_score = response._confidence;
        // userMessage.is_training_candidate = response._confidence >= this.model.min_fine_tune_confidence
        userMessage.tokens = rawResponse.prompt_eval_count
        userMessage.save()
        return response;
    }


    async generateAction(userInput, action) {
        // Save user message




        const baseContext = {
            params: {},
            outputs: {},
            ...this.context
        }


        const resolvedInput = expressionEvaluator.evaluatePlaceholders(
            userInput,
            baseContext
        );





        let userMessage = await this.saveMessage('user', resolvedInput, 1);


        const messages = await this.buildAIRequest(resolvedInput, { config: action.config, fields: action.parameters, name: action.name, id: action.id });


        let newOptions = { ...this.options, ...this.model.parameters }

        const rawResponse = await this.ollama.chat(
            this.model.model_name,
            messages,
            { ...newOptions, num_predict: newOptions.num_ctx }
        );


        console.log('ACTION MESSAGE', messages)


        let response = await this.processResponse(rawResponse)


        userMessage.confidence_score = response._confidence;
        // userMessage.is_training_candidate = response._confidence >= this.model.min_fine_tune_confidence
        userMessage.tokens = rawResponse.prompt_eval_count
        userMessage.save()
        return response;
    }

    //     async generate(userInput, options) {
    //     // Save user message
    //     const resolvedInput = expressionEvaluator.resolveFieldMappings(
    //         resolveConfig(userInput, this.context),
    //         this.context
    //     );

    //     const resolvedSystemInput = expressionEvaluator.resolveFieldMappings(
    //         resolveConfig(this.model.system_prompt, this.context),
    //         this.context
    //     );

    //     let userMessage = await this.saveMessage('user', resolvedInput, 1);

    //     const messages = await this.buildMessages(resolvedSystemInput);


    //     let newOptions = { ...this.options, ...this.model.parameters, ...options }

    //     const rawResponse = await this.ollama.chat(
    //         this.model.model_name,
    //         messages,
    //         { ...newOptions, num_predict: newOptions.num_ctx }
    //     );


    //     let response = await this.processResponse(rawResponse)


    //     userMessage.confidence_score = response._confidence;
    //     // userMessage.is_training_candidate = response._confidence >= this.model.min_fine_tune_confidence
    //     userMessage.tokens = rawResponse.prompt_eval_count
    //     userMessage.save()
    //     return response;
    // }

    async buildMessages() {

        const history = await db.Message.findAll({
            where: {
                conversation_id: this.conversation.id, role: { [Op.or]: ["assistant", "user"] }
            },
            order: [['created_at', 'ASC']],
            limit: 5, // Last 5 exchanges
            raw: true
        });


        let messages = history;


        let systemPrompt = await this.buildSystemPrompt();



        return [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            ...messages.map((m, index) => ({ role: m.role, content: m.content }))
        ];
    }

    async buildSystemPrompt() {
        let systemPrompt = '';
        if (this.model.system_prompt) {
            systemPrompt = ModelDeployer.generateSystemInstruction(this.model, this.model.system_prompt)
        } else {
            systemPrompt = await ModelDeployer.generateSystemInstruction(this.model, this.model.system_instruction);
        }

        // if (systemPrompt) {
        //     resolvedInput = expressionEvaluator.resolveFieldMappings(
        //         systemPrompt,
        //         this.context
        //     );
        // }


        // console.log('resolve prompt', resolvedInput)
        return systemPrompt;
    }

    /**
 * Build AI request payload for extracting parameters and filling config.
 * @param {string} userPrompt - The current user's prompt text.
 * @param {object} actionObject - The action object defining config, parameters, etc.
 * @param {Array} history - Array of past conversation messages, each { role, content }.
 * @returns {object} AI request payload ready for API call.
 */
    async buildAIRequest(userPrompt, actionObject) {
        const history = await db.Message.findAll({
            where: {
                conversation_id: this.conversation.id, role: { [Op.or]: ["assistant", "user"] }, name: {
                    [Op.is]: null
                }
            },
            order: [['created_at', 'ASC']],
            limit: 5, // Last 5 exchanges
            raw: true
        });


        let params = {}
        let defaults = {}

        let options = actionObject.fields.map(a => {
            params[a.field_name] = `<${a.data_type}>`;
            defaults[a.field_name] = `${a.default_value}`;
            return ({ [a.field_name]: a.options })
        })

        // let options = []

        const systemInstruction = `
Extract key-value pairs ONLY for fields listed in action.fields from the prompt and conversation history.
- Follow the exact data_type defined in each field.
- If default_value is provided and no explicit value is found, use default_value.
- If options are provided for a field:
  • Search for a related value in the prompt/history that matches one of the options exactly (case-sensitive, type-sensitive).
  • If no exact match is found, set the field value to null.
- Do not guess, infer, or hallucinate values not explicitly stated or implied.
- Use only the provided options when options exist; otherwise, use the exact value found.
- Fill placeholders in action.config with the extracted parameter values.
- If a placeholder references previous outputs (e.g., {{outputs.config.id}}), replace it only if the value exists in prior conversation data; otherwise, leave the placeholder unchanged.
- Output JSON in the format:
{
  "parameters": ${JSON.stringify(params, null, 2)},
  "template_output": ${JSON.stringify(actionObject.config, null, 2)}
}
- Do not include any extra fields not listed in action.fields.

${options.length ? `## FIELD OPTIONS
    ${JSON.stringify(options, null, 2)}
` : ''}
`;

        // Base messages: system + history + new prompt
        const messages = [
            { role: "system", content: systemInstruction },
            // ...history,
            {
                role: "user",
                content: `User Input: ${userPrompt}\n\nAction Object: ${JSON.stringify(actionObject, null, 2)} \n\n##TIMESTAMP: ${new Date().toISOString()}`
            }
        ];

        let newMessages = messages.map(a => ({ ...a, content: typeof a.content != 'string' ? JSON.stringify(a.content) : a.content }))



        // await this.saveMessage('system', systemInstruction, 1);
        // await this.saveMessage('action_object', JSON.stringify(actionObject), 1)


        return newMessages;
    }


    async processResponse(data) {
        try {

            let response;
            if (isJsonParsable(data.message.content)) {
                response = cleanAndParseJSON(data.message.content);
            } else {
                response = data.message.content;
            }

            // Calculate confidence (simplified example)
            // const confidence = this.calculateConfidence(response);
            // Save assistant message with confidence

            let assistantMessage = await this.saveMessage('assistant', data.message.content, 0);
            assistantMessage.tokens = data.eval_count;
            assistantMessage.save()


            return { ...response, _confidence: 0 };
        } catch (error) {
            console.log(error, 'EEE')
            throw new Error(`Response validation failed: ${error.message}`);
        }
    }

    calculateConfidence(response) {
        // Implement your confidence heuristic:
        // 1. Check against expected schema
        // 2. Validate option constraints
        // 3. Analyze response completeness

        const schemaKeys = Object.keys(generateFromSchema(this.model.output_schema));
        const responseKeys = Object.keys(response);




        // Basic confidence calculation
        const keyMatch = schemaKeys.filter(k => responseKeys.includes(k)).length / schemaKeys.length;
        // const optionMatch = this.validateOptions(response) ? 1 : 0.5;



        return keyMatch;
    }

    validateOptions(response) {
        for (const [key, options] of Object.entries(this.model.options)) {
            if (options && options.length > 0 && !options.includes(response[key])) {
                return false;
            }
        }
        return true;
    }

    async saveMessage(role, content, confidence = null) {
        let newRole = (role != 'user' && role != 'system' && role != 'assistant') ? 'assistant' : role;
        return await db.Message.create({
            role: newRole,
            name: (role != 'user' && role != 'system' && role != 'assistant') ? role : null,
            content,
            confidence_score: confidence,
            conversation_id: this.conversation.id,
            treadId: this.treadId,
            ai_preset_id: this.model.id
        });
    }

    /**
     * Create a fine-tuned version of the current model
     */
    // async createFineTunedVersion() {
    //     return FineTuner.createFineTunedModel(this.modelId);
    // }
}