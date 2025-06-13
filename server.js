// import express from "express";
// import cors from "cors";
// import bodyParser from "body-parser";
// import { PromptTemplate } from "@langchain/core/prompts";
// import { ConversationChain } from "langchain/chains";
// import { BufferMemory } from "langchain/memory";
// import { Ollama } from "./ollama.js"; // Custom wrapper
// import multer from "multer";
// import path from "path";
// import { exec } from "child_process";
// import fs from "fs/promises";
// import { fileURLToPath } from "url";
// import { dirname } from "path";

// // Routers
// import configRouter from "./routes/config.route.js";
// import resourceRouter from "./routes/resource.route.js";
// import resourceTagsRouter from "./routes/resourceTags.js";
// import touchpointRouter from "./routes/touchpoint.route.js";
// import promptRouter from "./routes/prompt.route.js";
// import resourcetagRouter from "./routes/resource-tag.route.js";
// import { resourceParent } from "./middlewares/resourceParent.js";
// import connectDB from "./services/db.js";

// // Constants
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);
// const VENV_PYTHON = path.join(__dirname, "venv", "bin", "python"); // Path to venv Python
// const UPLOADS_DIR = path.join(__dirname, "uploads");

// // Initialize app
// const app = express();
// const port = process.env.PORT || 3500;

// // Middleware
// app.use(cors());
// app.use(bodyParser.json());
// app.use(resourceParent);
// app.use("/config", express.static("config"));

// // Database
// connectDB();

// // File upload
// const upload = multer({ dest: UPLOADS_DIR });

// // LangChain setup
// const model = new Ollama({ model: "mistral" });
// const promptTemplate = PromptTemplate.fromTemplate(
//   `You are a helpful AI assistant.\n\n{input}`
// );
// const memory = new BufferMemory({
//   returnMessages: true,
//   memoryKey: "chat_history",
// });
// const chain = new ConversationChain({
//   llm: { call: async ({ input }) => ({ response: await model.call(input) }) },
//   prompt: promptTemplate,
//   memory,
// });

// // Routes
// app.use("/api/config", configRouter);
// app.use("/api/resources", resourceRouter);
// app.use("/api/resource-tags", resourceTagsRouter);
// app.use("/api/touchpoints", touchpointRouter);
// app.use("/api/prompt", promptRouter);
// app.use("/api/v1", resourcetagRouter);

// app.get("/api/test", async (req, res) => {
//   try {
//     res.json({ result: "Test Working!" });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// app.post("/api/chat", async (req, res) => {
//   try {
//     const { input } = req.body;
//     const response = await chain.call({ input });
//     res.json({ result: response.response });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// app.post("/transcribe-mp3", upload.single("audio"), async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ error: "No file uploaded" });
//   }

//   const mp3Path = path.resolve(req.file.path);
//   const wavPath = `${mp3Path}.wav`;
//   const pythonScript = path.join(__dirname, "transcribe.py");

//   try {
//     // Convert MP3 → WAV
//     await new Promise((resolve, reject) => {
//       exec(
//         `ffmpeg -y -i "${mp3Path}" -ar 16000 -ac 1 "${wavPath}"`,
//         { timeout: 30000 },
//         (err, stdout, stderr) => (err ? reject(stderr) : resolve(stdout))
//       );
//     });

//     // Run transcription with venv Python
//     const { stdout } = await new Promise((resolve, reject) => {
//       exec(
//         `${VENV_PYTHON} ${pythonScript} "${wavPath}"`,
//         { timeout: 60000 }, // 60s timeout for Whisper
//         (err, stdout, stderr) => (err ? reject(stderr) : resolve({ stdout }))
//       );
//     });

//     res.json({ text: stdout.trim() });
//   } catch (error) {
//     console.error("Transcription error:", error);
//     res.status(500).json({
//       error: "Failed to transcribe",
//       details: error.toString(),
//     });
//   } finally {
//     await Promise.allSettled([fs.unlink(mp3Path), fs.unlink(wavPath)]);
//   }
// });

// app.listen(port, () => {
//   console.log(`Server running on http://localhost:${port}`);
// });

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

//Routers
import configRouter from './routes/config.route.js';
import resourceRouter from './routes/resource.route.js';
import resourceTagsRouter from './routes/resourceTags.js';
import touchpointRouter from './routes/touchpoint.route.js';
import promptRouter from './routes/prompt.route.js';
import resourcetagRouter from './routes/resource-tag.route.js';
import dynamicChatRouter from './routes/dynamic-chat.route.js';

import { resourceParent } from "./middlewares/resourceParent.js";

import mongoose from 'mongoose'
import connectDB from './services/db.js';

// const swaggerUi = require("swagger-ui-express");
// const swaggerSpec = require("./docs/swagger");
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./docs/swagger.js";

// mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alayon', {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
// })
//     .then(() => console.log('MongoDB connected'))
//     .catch((err) => console.error('MongoDB connection error:', err))

connectDB();

const app = express();
const port = process.env.PORT || 3500;

app.use(cors());
app.use(bodyParser.json());
app.use(resourceParent);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use('/config', express.static('config'))


app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));


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

app.use("/api/config", configRouter);
app.use("/api/resources", resourceRouter);
app.use("/api/resource-tags", resourceTagsRouter);
app.use("/api/touchpoints", touchpointRouter);
app.use("/api/prompt", promptRouter);

//V1
app.use("/api/v1", resourcetagRouter);
app.use("/api/v1/chat", dynamicChatRouter);

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
            exec(`python3 transcribe.py "${wavPath}"`, (err, stdout, stderr) => {
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
