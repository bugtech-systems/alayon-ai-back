import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { PromptTemplate } from "@langchain/core/prompts";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";
import { Ollama } from "./ollama.js"; // Custom wrapper
import multer from 'multer';
import path from 'path';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const upload = multer({ dest: path.join(__dirname, 'uploads') });


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


app.post('/transcribe-mp3', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const mp3Path = path.resolve(req.file.path);
    const wavPath = mp3Path + '.wav';

    const pythonScript = path.resolve("../transcriber/transcribe.py");
    const venvPython = path.resolve("../venv/bin/python");

    const cmd = `${venvPython} ${pythonScript} ${mp3Path}`;


    try {
        // Convert MP3 → WAV (mono, 16kHz)
        await new Promise((resolve, reject) => {
            exec(`ffmpeg -y -i "${mp3Path}" -ar 16000 -ac 1 "${wavPath}"`, (err, stdout, stderr) => {
                if (err) return reject(stderr);
                resolve(stdout);
            });
        });

        // Run Python Whisper transcription
        const { stdout } = await new Promise((resolve, reject) => {
            exec(cmd, (err, stdout, stderr) => {
                if (err) return reject(stderr);
                resolve({ stdout });
            });
        });

        res.json({ text: stdout.trim() });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to transcribe' });
    } finally {
        await fs.unlink(mp3Path).catch(() => { });
        await fs.unlink(wavPath).catch(() => { });
    }
});


app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
