import { Ollama } from 'ollama';
import { ResourceTag } from '../models/resourceTag.model.js';
import { sessionManager } from './SessionManager.js';
import { actionInstructions } from '../config/actionInstructions.js';
import { getResourceOptions } from './resourceService.js';

export class ConversationProcessor {
    constructor() {
        this.ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' });
        this.model = process.env.OLLAMA_MODEL || 'mistral:7b';
        this.actionInstructions = actionInstructions;
        this.log = this.createLogger();
    }

    createLogger() {
        return {
            info: (message, data) => console.log(`[INFO] ${message}`, data),
            warn: (message, error) => console.warn(`[WARN] ${message}`, error),
            error: (message, error) => console.error(`[ERROR] ${message}`, error),
            debug: (message, data) => console.debug(`[DEBUG] ${message}`, data)
        };
    }

    /**
     * Adds a message to the conversation history
     * @param {object} session - Current session object
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - Message content
     */
    addToHistory(session, role, content) {
        this.log.debug('Adding to conversation history', { role, contentLength: content.length });
        session.conversationHistory.push({
            role,
            content,
            timestamp: new Date()
        });
        sessionManager.updateSession(session.id, session);
    }

    /**
     * Main processing pipeline
     * @param {string} prompt - User input
     * @param {string|null} sessionId - Existing session ID
     * @returns {Promise<object>} Response object
     */
    async process(prompt, sessionId = null) {
        this.log.info('Starting conversation processing', { prompt, sessionId });

        try {
            // 1. Get or create session
            const session = sessionManager.getSession(sessionId);
            this.log.debug('Session retrieved', { sessionId: session.id });

            // 2. Add user message to history
            this.addToHistory(session, 'user', prompt);

            // 3. Detect action if not set
            if (!session.action) {
                this.log.debug('No action detected, initiating action detection');
                session.action = await this.detectAction(prompt);
                sessionManager.updateSession(session.id, session);
                this.log.info('Action detected', { action: session.action });
            }

            // 4. Handle initial selections if needed
            // if (!session.organization || !session.resourceType) {
            //     this.log.debug('Handling initial selections');
            //     return this.handleInitialSelections(prompt, session);
            // }

            // 5. Process based on detected action
            this.log.debug('Processing action flow', { action: session.action });
            return this.handleActionFlow(prompt, session);

        } catch (error) {
            this.log.error('Processing failed', error);
            return {
                error: 'processing_error',
                message: 'We encountered an issue processing your request',
                recovery: 'Please try again or rephrase your request',
                sessionId: sessionId
            };
        }
    }

    /**
     * Detects the action type from user prompt
     * @param {string} prompt - User input
     * @returns {Promise<string>} Action type (GET/CREATE/UPDATE/DELETE)
     */
    async detectAction(prompt) {
        this.log.debug('Detecting action from prompt', { prompt });

        try {
            const response = await this.ollama.generate({
                model: this.model,
                prompt: `Classify intent from:\n"${prompt}"\nRespond ONLY with: GET, CREATE, UPDATE, or DELETE`,
                format: 'json',
                options: { temperature: 0.1 }
            });

            // Parse response safely
            const action = (response.response || '').trim().toUpperCase();
            const validActions = ['GET', 'CREATE', 'UPDATE', 'DELETE'];
            console.log(action, validActions, 'VVV', response.response)
            if (validActions.includes(action)) {
                this.log.debug('Action detected via AI', { action });
                return action;
            }

            this.log.warn('Invalid action from AI, using fallback');
            return this.fallbackActionDetection(prompt);

        } catch (error) {
            this.log.error('AI action detection failed, using fallback', error);
            return this.fallbackActionDetection(prompt);
        }
    }

    /**
     * Fallback action detection using keyword matching
     * @param {string} prompt - User input
     * @returns {string} Detected action
     */
    fallbackActionDetection(prompt) {
        this.log.debug('Using fallback action detection');
        const lowerPrompt = prompt.toLowerCase();

        if (['show', 'view', 'get', 'check'].some(w => lowerPrompt.includes(w))) return 'GET';
        if (['create', 'new', 'add', 'order'].some(w => lowerPrompt.includes(w))) return 'CREATE';
        if (['update', 'change', 'modify'].some(w => lowerPrompt.includes(w))) return 'UPDATE';
        if (['delete', 'remove', 'cancel'].some(w => lowerPrompt.includes(w))) return 'DELETE';

        return 'GET'; // Default fallback
    }

    /**
     * Handles organization and resource type selection
     * @param {string} prompt - User input
     * @param {object} session - Current session
     * @returns {Promise<object>} Response object
     */
    async handleInitialSelections(prompt, session) {
        this.log.debug('Handling initial selections', {
            hasOrganization: !!session.organization,
            hasResourceType: !!session.resourceType
        });

        // Organization selection flow
        if (!session.organization) {
            this.log.debug('Processing organization selection');

            if (!session.organizationOptions) {
                this.log.debug('Fetching organization options');
                session.organizationOptions = await this.fetchOrganizations();
                sessionManager.updateSession(session.id, session);
            }

            const matchedOrg = await this.fuzzyMatch(prompt, session.organizationOptions, 'organization');
            if (matchedOrg) {
                this.log.info('Organization matched', { organization: matchedOrg });
                session.organization = matchedOrg;
                sessionManager.updateSession(session.id, session);
                return this.promptForResourceType(session);
            }

            console.log(matchedOrg, 'maatch org')

            return this.promptForOrganization(session);
        }

        // Resource type selection flow
        if (!session.resourceTypeOptions) {
            this.log.debug('Fetching resource type options');
            session.resourceTypeOptions = await this.fetchResourceTypes();
            sessionManager.updateSession(session.id, session);
        }

        const matchedType = await this.fuzzyMatch(prompt, session.resourceTypeOptions, 'resource type');
        if (matchedType) {
            this.log.info('Resource type matched', { resourceType: matchedType });
            session.resourceType = matchedType;
            session.fieldConfigs = await this.fetchFieldConfigs(matchedType);
            sessionManager.updateSession(session.id, session);
            return this.generateActionPrompt(session);
        }

        return this.promptForResourceType(session);
    }

    /**
     * Fuzzy matches user input to available options using AI
     * @param {string} prompt - User input
     * @param {string[]} options - Available options
     * @param {string} context - Context for matching
     * @returns {Promise<string|null>} Matched option or null
     */
    async fuzzyMatch(prompt, options, context) {
        this.log.debug('Attempting fuzzy match', { options, context });
        console.log(prompt, options, context)
        try {
            // First try simple text matching
            const lowerPrompt = prompt.toLowerCase();
            const simpleMatch = options.find(opt =>
                lowerPrompt.includes(opt.toLowerCase()) ||
                opt.toLowerCase().includes(lowerPrompt)
            );

            if (simpleMatch) {
                this.log.debug('Simple match found', { match: simpleMatch });
                return simpleMatch;
            }

            // Use AI for more complex matching
            this.log.debug('Using AI for fuzzy matching');
            const result = await this.ollama.chat({
                model: this.model,
                messages: [{
                    role: 'system',
                    content: `Select EXACTLY ONE option from: ${options.join(', ')}. 
                             Respond ONLY with the matching option exactly as written.`
                }, {
                    role: 'user',
                    content: `In context of ${context}, match this: "${prompt}"`
                }]
            });

            const response = result?.message?.content?.trim();
            if (!response) {
                this.log.warn('Empty AI response in fuzzy match');
                return null;
            }

            // Find exact match preserving case
            const matchedOption = options.find(opt => opt === response);

            if (matchedOption) {
                this.log.debug('AI match found', { match: matchedOption });
                return matchedOption;
            }

            this.log.warn('No exact match found in options', { response, options });
            return null;

        } catch (error) {
            this.log.error('Fuzzy match failed', error);
            return null;
        }
    }

    // ... (remaining methods like fetchOrganizations, promptForOrganization, etc.)
    async fetchOrganizations() {
        const orgs = await getResourceOptions('organizations');

        console.log(orgs, 'ORGGS')

        return orgs;
    }

    /**
     * Generates dynamic, engaging prompts for organization selection using AI
     */
    async promptForOrganization(session, userPrompt = "") {
        const { organizationOptions } = session;
        const optionsList = organizationOptions.map(opt => `• ${opt}`).join('\n');

        try {
            // Generate context-aware response
            const response = await this.ollama.chat({
                model: this.model,
                messages: [{
                    role: 'system',
                    content: `Respond to the user's request about organization selection.
                Strict Rules:
                1. Always include ALL available options: ${organizationOptions.join(', ')}
                2. If user hasn't selected, politely guide them to choose
                3. For partial/invalid inputs, suggest matching options
                4. Maintain professional yet friendly tone
                5. Never hallucinate options
                
                Examples:
                - Initial prompt: "Hello! Please select from: [options]"
                - Partial match: "I found similar options: [matching]"
                - Invalid input: "Did you mean one of these? [options]"`
                }, {
                    role: 'user',
                    content: userPrompt || "Please help me select an organization"
                }],
                options: { temperature: 0.3 }
            });

            // Validate response contains at least one option
            let message = response.message?.content?.trim();
            if (!message || !organizationOptions.some(opt => message.includes(opt))) {
                message = this.getDefaultOrgPrompt(organizationOptions, userPrompt);
            }

            return {
                sessionId: session.id,
                message: this.ensureOptionsIncluded(message, organizationOptions),
                status: 'organization_selection',
                action: { method: 'GET', endpoint: '/continue' },
                metadata: {
                    strictOptions: organizationOptions,
                    inputReceived: !!userPrompt.trim()
                }
            };

        } catch (error) {
            console.error('Organization prompt error:', error);
            return this.getErrorResponse(session, organizationOptions, userPrompt);
        }
    }

    // Helper methods
    ensureOptionsIncluded(message, options) {
        const includesAllOptions = options.every(opt => message.includes(opt));
        return includesAllOptions ? message : `${message}\n\nOptions: ${options.join(', ')}`;
    }

    getDefaultOrgPrompt(options, userPrompt = "") {
        const base = userPrompt
            ? "Thank you for your request. Please select from:"
            : "Hello! To begin, please select your organization from:";

        return `${base}\n${options.map(opt => `• ${opt}`).join('\n')}\n\nYou can say part of the name (e.g. "Aqua" for AquaPure)`;
    }

    getErrorResponse(session, options, userPrompt) {
        return {
            sessionId: session.id,
            message: userPrompt
                ? `I couldn't process your request. Available options:\n${options.join('\n')}`
                : this.getDefaultOrgPrompt(options),
            status: 'organization_selection',
            action: { method: 'GET', endpoint: '/continue' }
        };
    }

    /**
     * Generates dynamic prompts for resource type selection using AI
     */
    async promptForResourceType(session) {
        try {
            const response = await this.ollama.chat({
                model: this.model,
                messages: [{
                    role: 'system',
                    content: `Create a helpful prompt for selecting a resource type. 
                 Current organization: ${session.organization}.
                 Options: ${session.resourceTypeOptions.join(', ')}.
                 Make it sound natural and suggest they can describe their need.
                 Include that we'll help match their description to the options.`
                }],
                options: { temperature: 0.7 }
            });

            const message = response.message?.content?.trim() ||
                `What type of resource do you need? Options: ${session.resourceTypeOptions.join(', ')}`;

            return {
                sessionId: session.id,
                message,
                status: 'resource_type_selection',
                action: { method: 'GET', endpoint: '/continue' },
                currentOrganization: session.organization,
                metadata: {
                    options: session.resourceTypeOptions,
                    matchingHint: "I'll help match your needs to our options"
                }
            };
        } catch (error) {
            console.error('AI prompt generation failed, using fallback:', error);
            return {
                sessionId: session.id,
                message: `Now, what type of resource are we working with? Available options:\n${session.resourceTypeOptions.map(rt => `• ${rt}`).join('\n')
                    }\n\nYou can describe what you need in your own words.`,
                status: 'resource_type_selection',
                action: { method: 'GET', endpoint: '/continue' },
                currentOrganization: session.organization
            };
        }
    }

    /**
     * Generates follow-up prompts when no match is found
     */
    async generateNoMatchPrompt(context, options, session) {
        try {
            const response = await this.ollama.chat({
                model: this.model,
                messages: [{
                    role: 'system',
                    content: `Generate a helpful follow-up message explaining we couldn't match their input to ${context} options.
                 Available options: ${options.join(', ')}.
                 Be apologetic but helpful, and explain they can try again or say 'help'.`
                }],
                options: { temperature: 0.6 }
            });

            return response.message?.content?.trim() ||
                `I couldn't find a matching ${context}. Available options: ${options.join(', ')}`;
        } catch (error) {
            console.error('AI follow-up generation failed:', error);
            return `Let's try that again. Please select a ${context} from: ${options.join(', ')}`;
        }
    }

    async handleActionFlow(prompt, session) {
        // Define all action handlers
        const actionHandlers = {
            GET: this.handleGetAction,
            CREATE: this.handleCreateAction,
            UPDATE: this.handleUpdateAction,
            DELETE: this.handleDeleteAction
        };

        // Get the handler for the current action
        const actionHandler = actionHandlers[session.action];

        // Ensure the handler exists and is a function
        if (typeof actionHandler === 'function') {
            // Bind the handler to the current instance
            const boundHandler = actionHandler.bind(this);
            return boundHandler(prompt, session);
        } else {
            console.error('Invalid action handler:', {
                action: session.action,
                availableActions: Object.keys(actionHandlers),
                sessionId: session.id
            });

            return {
                sessionId: session.id,
                message: `We encountered an issue processing your ${session.action} request. Please try again.`,
                status: 'error',
                action: { method: 'GET', endpoint: '/continue' },
                recovery: `Available actions: ${Object.keys(actionHandlers).join(', ')}`
            };
        }
    }

    async handleGetAction(prompt, session) {
        console.log('Processing GET action', { sessionId: session.id });
        // Actual implementation would go here
        return {
            sessionId: session.id,
            message: 'Retrieving information...',
            status: 'processing',
            action: { method: 'GET', endpoint: '/data' }
        };
    }

    async handleCreateAction(prompt, session) {
        console.log('Processing CREATE action', { sessionId: session.id });
        // Actual implementation would go here
        return {
            sessionId: session.id,
            message: 'Creating new resource...',
            status: 'processing',
            action: { method: 'POST', endpoint: '/create' }
        };
    }

    async handleUpdateAction(prompt, session) {
        console.log('Processing UPDATE action', { session, prompt });
        // Actual implementation would go here
        return {
            sessionId: session.id,
            message: 'Updating resource...',
            status: 'processing',
            action: { method: 'PUT', endpoint: '/update' }
        };
    }

    async handleDeleteAction(prompt, session) {
        console.log('Processing DELETE action', { sessionId: session.id });
        // Actual implementation would go here
        return {
            sessionId: session.id,
            message: 'Deleting resource...',
            status: 'processing',
            action: { method: 'DELETE', endpoint: '/delete' }
        };
    }
}