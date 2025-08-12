import axios from 'axios';

const OLLAMA_BASE_URL = process.env.AI_HOST || 'http://127.0.0.1:11434/api';

export class OllamaClient {
    constructor() {
        this.client = axios.create({
            baseURL: OLLAMA_BASE_URL,
            timeout: 120000 // Longer timeout for complex tasks
        });


        console.log(OLLAMA_BASE_URL, 'OLLAMA BASE')
    }

    async chat(model, messages, options) {
        try {
            const response = await this.client.post('/chat', {
                model,
                messages,
                options: {
                    num_predict: 512,
                    top_k: 40,
                    top_p: 0.9,
                    ...options
                },
                format: 'json',
                stream: false
            });

            return response.data;
        } catch (error) {
            throw new Error(`Ollama API error: ${error.response?.data?.error || error.message}`);
        }
    }

    async createModel(modelName, modelfile) {
        const response = await this.client.post('/create', {
            name: modelName,
            modelfile
        });
        return response.data;
    }

    async generateEmbeddings(model, content) {
        const response = await this.client.post('/embeddings', {
            model,
            prompt: content
        });
        return response.data.embedding;
    }
}