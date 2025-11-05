import axios from 'axios';
import os from 'os'; // Use ES6 import instead of require

const OLLAMA_BASE_URL = process.env.AI_HOST || 'http://127.0.0.1:11434/api';
const DEFAULT_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT) || 120000;

export class OllamaClient {
    constructor() {
        this.client = axios.create({
            baseURL: OLLAMA_BASE_URL,
            timeout: DEFAULT_TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
            }
        });

        this.loadedModels = new Map();
        this.requestQueue = new Map();
        
        // Setup request interceptors for better monitoring
        this.setupInterceptors();
    }

    // Request/Response interceptors for monitoring and debugging
    setupInterceptors() {
        this.client.interceptors.request.use(
            (config) => {
                const requestId = this.generateRequestId();
                config.metadata = { startTime: Date.now(), requestId };
                
                console.log(`🚀 Ollama Request [${requestId}]: ${config.method?.toUpperCase()} ${config.url}`);
                if (config.data?.model) {
                    console.log(`   Model: ${config.data.model}`);
                }
                
                return config;
            },
            (error) => {
                console.error('❌ Ollama Request Error:', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            (response) => {
                const { startTime, requestId } = response.config.metadata || {};
                const duration = Date.now() - startTime;
                
                console.log(`✅ Ollama Response [${requestId}]: ${duration}ms`);
                
                // Log performance metrics if available
                if (response.data) {
                    const metrics = this.extractMetrics(response.data);
                    if (metrics) {
                        console.log(`   📊 Metrics: ${metrics.eval_count} tokens in ${Math.round(metrics.eval_duration / 1000000)}ms`);
                    }
                }
                
                return response;
            },
            (error) => {
                const { startTime, requestId } = error.config?.metadata || {};
                const duration = Date.now() - startTime;
                
                console.error(`❌ Ollama Error [${requestId}]: ${duration}ms`, {
                    status: error.response?.status,
                    message: error.response?.data?.error || error.message
                });
                
                return Promise.reject(error);
            }
        );
    }

    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    extractMetrics(data) {
        if (!data) return null;
        
        return {
            total_duration: data.total_duration,
            load_duration: data.load_duration,
            prompt_eval_count: data.prompt_eval_count,
            prompt_eval_duration: data.prompt_eval_duration,
            eval_count: data.eval_count,
            eval_duration: data.eval_duration
        };
    }

    // Enhanced chat method with better options and performance
    async chat(model, messages, options = {}) {
        const requestOptions = this.buildRequestOptions(options);
        
        try {
            const response = await this.client.post('/chat', {
                model,
                messages: this.validateMessages(messages),
                options: requestOptions,
                stream: false,
                keep_alive: options.keep_alive || '5m'
            });

            this.trackModelUsage(model);
            return this.formatResponse(response.data);

        } catch (error) {
            throw this.handleOllamaError(error, 'chat', model);
        }
    }

    // Enhanced generate method with template support
    async generate(model, prompt, options = {}) {
        const requestOptions = this.buildRequestOptions(options);
        
        try {
            const response = await this.client.post('/generate', {
                model,
                prompt: this.validatePrompt(prompt),
                options: requestOptions,
                stream: false,
                keep_alive: options.keep_alive || '5m',
                format: options.format || (options.json ? 'json' : undefined)
            });

            this.trackModelUsage(model);
            return this.formatResponse(response.data);

        } catch (error) {
            throw this.handleOllamaError(error, 'generate', model);
        }
    }

    // Build optimized request options
    buildRequestOptions(customOptions = {}) {
        const defaultOptions = {
            // Performance optimized defaults
            temperature: customOptions.temperature ?? 0.1,
            top_k: customOptions.top_k ?? 40,
            top_p: customOptions.top_p ?? 0.7,
            num_predict: customOptions.num_predict ?? 512,
            repeat_penalty: customOptions.repeat_penalty ?? 1.1,
            num_ctx: customOptions.num_ctx ?? 4096,
            num_thread: customOptions.num_thread ?? this.getOptimalThreadCount(),
            num_batch: customOptions.num_batch ?? 512,
            stop: customOptions.stop ?? ['\n\n', 'USER:', 'ASSISTANT:', 'SYSTEM:']
        };

        // Remove undefined values from custom options
        const cleanCustomOptions = Object.fromEntries(
            Object.entries(customOptions).filter(([_, value]) => value !== undefined)
        );

        return { ...defaultOptions, ...cleanCustomOptions };
    }

    getOptimalThreadCount() {
        // Use available CPU cores, but leave some for system
        const availableCores = os.cpus().length; // Fixed: use imported 'os'
        return Math.max(2, Math.floor(availableCores * 0.75)); // Use 75% of cores
    }

    // Model management methods
    async createModel(modelName, modelfile, options = {}) {
        try {
            const response = await this.client.post('/create', {
                name: modelName,
                modelfile,
                stream: false,
                ...options
            });

            console.log(`✅ Model created: ${modelName}`);
            return response.data;

        } catch (error) {
            throw this.handleOllamaError(error, 'createModel', modelName);
        }
    }

    async deleteModel(modelName) {
        try {
            await this.client.delete('/delete', { data: { name: modelName } });
            console.log(`🗑️ Model deleted: ${modelName}`);
            this.loadedModels.delete(modelName);
            return true;
        } catch (error) {
            throw this.handleOllamaError(error, 'deleteModel', modelName);
        }
    }

    async listModels() {
        try {
            const response = await this.client.get('/tags');
            return response.data.models || [];
        } catch (error) {
            throw this.handleOllamaError(error, 'listModels');
        }
    }

    async pullModel(modelName) {
        try {
            const response = await this.client.post('/pull', {
                name: modelName,
                stream: false
            });
            console.log(`📥 Model pulled: ${modelName}`);
            return response.data;
        } catch (error) {
            throw this.handleOllamaError(error, 'pullModel', modelName);
        }
    }

    // Embeddings with better error handling
    async generateEmbeddings(model, content) {
        try {
            const response = await this.client.post('/embeddings', {
                model,
                prompt: content
            });
            
            if (!response.data.embedding) {
                throw new Error('No embeddings returned from Ollama');
            }
            
            return response.data.embedding;
        } catch (error) {
            throw this.handleOllamaError(error, 'generateEmbeddings', model);
        }
    }

    // Model status and health methods
    async getModelInfo(modelName) {
        try {
            const response = await this.client.post('/show', {
                name: modelName
            });
            return response.data;
        } catch (error) {
            throw this.handleOllamaError(error, 'getModelInfo', modelName);
        }
    }

    async healthCheck() {
        try {
            const response = await this.client.get('/tags');
            return {
                status: 'healthy',
                models: response.data.models?.length || 0,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Pre-load models for better performance
    async preloadModel(modelName, keepAlive = '10m') {
        try {
            // Send a minimal request to load the model
            await this.generate(modelName, 'ping', {
                num_predict: 1,
                temperature: 0,
                keep_alive: keepAlive
            });
            
            this.loadedModels.set(modelName, {
                lastUsed: Date.now(),
                keepAliveUntil: Date.now() + this.parseKeepAlive(keepAlive)
            });
            
            console.log(`🔥 Model pre-loaded: ${modelName}`);
            return true;
        } catch (error) {
            console.warn(`⚠️ Failed to pre-load ${modelName}:`, error.message);
            return false;
        }
    }

    parseKeepAlive(keepAlive) {
        if (typeof keepAlive === 'number') return keepAlive * 1000;
        
        const match = keepAlive.match(/^(\d+)([smh])$/);
        if (!match) return 300000; // Default 5 minutes
        
        const [, value, unit] = match;
        const multipliers = { s: 1000, m: 60000, h: 3600000 };
        return parseInt(value) * (multipliers[unit] || 60000);
    }

    trackModelUsage(modelName) {
        this.loadedModels.set(modelName, {
            lastUsed: Date.now(),
            keepAliveUntil: Date.now() + 300000 // 5 minutes default
        });
    }

    // Validation methods
    validateMessages(messages) {
        if (!Array.isArray(messages)) {
            throw new Error('Messages must be an array');
        }

        return messages.map(msg => ({
            role: msg.role || 'user',
            content: String(msg.content || ''),
            ...(msg.images ? { images: msg.images } : {})
        }));
    }

    validatePrompt(prompt) {
        if (typeof prompt !== 'string') {
            throw new Error('Prompt must be a string');
        }
        
        if (prompt.trim().length === 0) {
            throw new Error('Prompt cannot be empty');
        }
        
        return prompt;
    }

    // Response formatting
    formatResponse(data) {
        return {
            response: data.response,
            metrics: this.extractMetrics(data),
            model: data.model,
            createdAt: data.created_at,
            done: data.done,
            // Include raw data for backward compatibility
            ...data
        };
    }

    // Enhanced error handling
    handleOllamaError(error, operation, model = null) {
        const context = model ? ` (model: ${model})` : '';
        
        if (error.response) {
            // Ollama API returned an error
            const ollamaError = error.response.data?.error;
            const status = error.response.status;
            
            const enhancedError = new Error(
                `Ollama ${operation} failed${context}: ${ollamaError || error.message}`
            );
            
            enhancedError.code = `OLLAMA_${status}`;
            enhancedError.operation = operation;
            enhancedError.model = model;
            enhancedError.details = ollamaError;
            enhancedError.status = status;
            
            return enhancedError;
        }
        
        if (error.request) {
            // Network error - Ollama not reachable
            const enhancedError = new Error(
                `Ollama server unreachable${context}: ${error.message}`
            );
            enhancedError.code = 'OLLAMA_CONNECTION_FAILED';
            enhancedError.operation = operation;
            return enhancedError;
        }
        
        // Other errors
        const enhancedError = new Error(
            `Ollama ${operation} failed${context}: ${error.message}`
        );
        enhancedError.operation = operation;
        enhancedError.model = model;
        
        return enhancedError;
    }

    // Utility methods
    async waitForModel(modelName, timeout = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                await this.getModelInfo(modelName);
                return true;
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        throw new Error(`Model ${modelName} not available after ${timeout}ms`);
    }

    // Cleanup method
    async cleanup() {
        this.loadedModels.clear();
    }

    // Simple generate method for backward compatibility
    async simpleGenerate(model, prompt, options = {}) {
        return this.generate(model, prompt, options);
    }
}

// Singleton instance for shared use
let ollamaInstance = null;

export function getOllamaClient() {
    if (!ollamaInstance) {
        ollamaInstance = new OllamaClient();
    }
    return ollamaInstance;
}

export default OllamaClient;