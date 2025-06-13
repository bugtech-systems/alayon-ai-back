// services/ollamaService.js
import axios from "axios";

export const chatWithAI = async (messages) => {
    const { data } = await axios.post("http://127.0.0.1:11434/api/chat", {
        model: "mistral",
        messages,
        stream: false,
        options: {
            temperature: 0.3,
            top_p: 0.95,
        }
    });
    return data.message.content;
};
