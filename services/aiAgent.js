import { db } from '../models/index.js';
import { OllamaClient } from '../helpers/ollama-client.js';
import { ActionEngine } from '../services/ActionEngine.js';
import { cleanAndParseJSON, generateFromSchema, isJsonParsable, generateExecutionId, generateFieldTypeMap } from '../helpers/helpers.js';
import * as expressionEvaluator from './expressionEvaluator.js';
import { resolveConfig, resolveParameters, resolvePlaceholders } from '../helpers/parameterResolver.js';
import { Op } from 'sequelize';




export class AIAgent {
    constructor(modelId, sessionId) {
        this.modelId = modelId;
        this.sessionId = sessionId;
        this.action = null;
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

    async initialize(context) {
        let options = {}

        if (Number.isInteger(this.modelId) || /^\d+$/.test(this.modelId)) {
            // If identifier is a number, use it directly as parent ID
            options = { id: this.modelId }
        } else {
            options = { model_name: this.modelId }
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

        this.context = baseContext;

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
        console.log(this.context, 'THIS CONTEXT GENERATED', model)

    }

    async generate(userInput, options) {
        // Save user message

        const baseContext = {
            params: {},
            outputs: {},
            ...this.context
        }

        console.log(userInput, 'plaaaa  ')

        const resolvedInput = expressionEvaluator.evaluatePlaceholders(
            userInput,
            baseContext
        );


        console.log(userInput, resolvePlaceholders(userInput, baseContext), 'pla')



        let userMessage = await this.saveMessage('user', resolvedInput, 1);

        const messages = await this.buildMessages();


        let newOptions = { ...this.options, ...this.model.parameters, ...options }

        const rawResponse = await this.ollama.chat(
            this.model.model_name,
            messages,
            { ...newOptions, num_predict: newOptions.num_ctx }
        );

        console.log('CHAT CONFIG',
            this.model.model_name,
            messages,
            { ...newOptions, num_predict: newOptions.num_ctx }, rawResponse)

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
        const messages = await db.Message.findAll({
            where: { conversation_id: this.conversation.id },
            order: [['created_at', 'ASC']],
            limit: 10, // Last 5 exchanges
            raw: true
        });




        let systemPrompt = this.buildSystemPrompt();



        return [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            ...messages.map((m, index) => ({ role: m.role, content: `${(messages.length - 1 <= index && m.role == 'user') ? `${m.content}\n\n**DATE NOW**: ${new Date().toISOString()}` : m.content}` }))
        ];
    }

    buildSystemPrompt() {
        let systemPrompt = '';
        if (this.action) {
            systemPrompt = `
# Strict Schema Parameter Extractor

## CORE PRINCIPLES
1. NO HALLUCINATION: Return null for any uncertain values
2. SCHEMA-ONLY: Only extract fields explicitly defined in parameters schema
3. VERBATIM VALUES: Capture only exact matches from input text

## INPUT PROCESSING
1. SCAN INPUTS:
   - Current prompt
   - Immediate previous turn (1 message back)
   - System context variables

2. EXTRACTION RULES:
   - Field must exist in parameters_schema
   - Value must appear verbatim in input
   - No value transformation or inference


## CONTEXT DATA:
${JSON.stringify(this.context, null, 2)}
**action_type**: "${this.action.tool_type}"
**template_output**: ${JSON.stringify(this.action.config, null, 2)}

## PARAMETERS SCHEMA:
**parameters_schema**: ${JSON.stringify(this.action.parameters, null, 2)}

JSON SCHEMA:
${JSON.stringify(this.model?.output_schema, null, 2)}



         
         `
        } else if (this.model.system_prompt) {
            systemPrompt = this.model.system_prompt
        }

        // if (systemPrompt) {
        //     resolvedInput = expressionEvaluator.resolveFieldMappings(
        //         systemPrompt,
        //         this.context
        //     );
        // }

        console.log('system prompt', systemPrompt, this.context, resolveConfig(systemPrompt, this.context),
            this.context)

        // console.log('resolve prompt', resolvedInput)
        return expressionEvaluator.evaluatePlaceholders(systemPrompt, this.context);
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
            const confidence = this.calculateConfidence(response);
            // Save assistant message with confidence

            let assistantMessage = await this.saveMessage('assistant', data.message.content, confidence);
            assistantMessage.tokens = data.eval_count;
            assistantMessage.save()


            return { ...response, _confidence: confidence };
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
        return await db.Message.create({
            role,
            content,
            confidence_score: confidence,
            conversation_id: this.conversation.id,
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