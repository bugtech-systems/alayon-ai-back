import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
// Import routes
import resourceTypesRouter from './routes/resourceTypes.js';
import resourcesRouter from './routes/resources.js';
import relationshipsRouter from './routes/relationships.js';
import actionTemplatesRouter from './routes/actionTemplates.js';
import resultReferencesRouter from './routes/resultReferences.js';
import chatRouter from './routes/chat.js';
import fineTuneRouter from './routes/trainModels.js';

import morgan from 'morgan';
import { swaggerSpec } from './configs/swagger.js';
import swaggerUi from 'swagger-ui-express'
import { initializeDatabase, db } from './models/index.js';
import { Op } from 'sequelize';

import multer from 'multer';
import path from 'path';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';




const app = express();


const port = process.env.PORT || 3300;

// Enhanced CORS configuration
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use('/config', express.static('config'))
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));


const upload = multer({ dest: path.join(__dirname, 'uploads') });







app.use('/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customSiteTitle: "PostgreSQL API Docs",
        customCss: '.swagger-ui .topbar { display: none }',
    })
);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Database synchronization with better error handling
const syncDatabase = async () => {
    let initializedDb;
    try {
        initializedDb = await initializeDatabase();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1); // Exit if database fails to initialize
    }
};

// Routes
app.use('/api/v1/resource-types', resourceTypesRouter);
app.use('/api/v1/resources', resourcesRouter);
app.use('/api/v1/relationships', relationshipsRouter);
app.use('/api/v1/action-templates', actionTemplatesRouter);
app.use('/api/v1/result-references', resultReferencesRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/tuner', fineTuneRouter);


app.post('/api/v1/transcribe-mp3', upload.single('audio'), async (req, res) => {
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
            exec(`python transcribe.py "${wavPath}"`, (err, stdout, stderr) => {
                if (err) return reject(stderr);
                resolve({ stdout });
            });
        });

        res.json({ text: stdout.trim() });
    } catch (error) {
        console.log('Error:', error);
        res.status(500).json({ error: 'Failed to transcribe' });
    } finally {
        await fs.unlink(mp3Path).catch(() => { });
        await fs.unlink(wavPath).catch(() => { });
    }
});


app.get('/api/v1/test', async (req, res) => {
    try {

        const resources = await db.ResourceTag.findAll({
            where: {
                resource_parent_id: 1,
                is_deleted: false,
                type: 'resource',
                attributes: {
                    status: {
                        [Op.in]: ['active', 'inactive']
                    }
                }
            }
        });


        console.log(resources, 'rrr')

        res.json({ text: 'Success', resources });
    } catch (error) {
        console.log('Error:', error);
        res.status(500).json({ error: 'Failed to transcribe' });
    }
});






// Enhanced error handling middleware
app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] Error:`, err);

    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Something went wrong!'
        : err.message;

    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Server startup
const startServer = async () => {
    await syncDatabase();

    app.listen(port, () => {
        console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode`);
        console.log(`API docs available at http://localhost:${port}/api-docs`);
        console.log(`Server listening on port ${port}`);
    });
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

startServer();