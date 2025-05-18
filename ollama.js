// ollama.js
import axios from "axios";

export class Ollama {
    constructor({ model = "mistral", baseUrl = "http://localhost:11434" }) {
        this.model = model;
        this.baseUrl = baseUrl;
    }

    async call(prompt) {
        const res = await axios.post(`${this.baseUrl}/api/generate`, {
            model: this.model,
            prompt,
        });
        return res.data.response;
    }
}
