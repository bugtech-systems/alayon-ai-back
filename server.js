import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { PromptTemplate } from "@langchain/core/prompts";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";
import { Ollama } from "./ollama.js"; // Custom wrapper

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

const model = new Ollama({ model: "mistral" });

const promptTemplate = PromptTemplate.fromTemplate(`
You are a helpful AI assistant.

{input}
`);

const memory = new BufferMemory({
    returnMessages: true,
    memoryKey: "chat_history",
});

const chain = new ConversationChain({
    llm: {
        call: async ({ input }) => {
            const response = await model.call(input);
            return { response };
        },
    },
    prompt: promptTemplate,
    memory,
});

app.get("/api/test", async (req, res) => {
    try {

        res.json({ result: "Test Working!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
    console.log(`Server running on http://localhost:${port}`);
});
