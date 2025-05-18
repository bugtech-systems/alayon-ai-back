import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

import { Ollama } from "langchain/llms/ollama";
import { PromptTemplate } from "langchain/prompts";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

const model = new Ollama({
    baseUrl: "http://localhost:11434",
    model: "mistral",
});

const prompt = PromptTemplate.fromTemplate(`
You are an AI assistant...

{input}
`);

const memory = new BufferMemory({ returnMessages: true });

const chain = new ConversationChain({
    llm: model,
    prompt,
    memory,
});

app.post("/api/chat", async (req, res) => {
    try {
        const { input } = req.body;
        const response = await chain.call({ input });
        res.json({ result: response.response });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
