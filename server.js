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
import actionTriggerRouter from './routes/actionTrigger.js';
import auditLogRouter from './routes/auditRoutes.js';
import aiPresetRouter from './routes/aiPreset.js';



import morgan from 'morgan';
import { swaggerSpec } from './configs/swagger.js';
import swaggerUi from 'swagger-ui-express'
import { initializeDatabase, db } from './models/index.js';

import multer from 'multer';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import SchedulerWorker from './workers/scheduledWorker.js';
import { validateTenantId } from './middleware/tenantMiddleware.js';
// Start action worker
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Path to your election data JSON file
const DATA_PATH = path.join(__dirname, 'uploads', 'SAN_ISIDRO.json');

// Helper function to apply filters
// Helper function to apply filters
// Enhanced filter matching with range support



// Read and cache election data
let electionData = [];
try {

    const rawData = fs.readFileSync(DATA_PATH);
    electionData = JSON.parse(rawData);
    if (!Array.isArray(electionData)) electionData = [electionData];
    console.log(`Loaded ${electionData.length} location records`);
} catch (error) {
    console.error('Error loading election data:', error);
    process.exit(1);
}


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
app.use(validateTenantId); // Global




app.use('/config', express.static('config'));
app.use('/api/v1/static', express.static(path.join(__dirname, 'uploads')))

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
app.use('/api/v1/action-triggers', actionTriggerRouter);
app.use('/api/v1/result-references', resultReferencesRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/tuner', fineTuneRouter);
app.use('/api/v1/audit-logs', auditLogRouter);
app.use('/api/v1/ai-presets', aiPresetRouter);





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

app.post('/api/v1/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }



    try {
        // Convert MP3 → WAV (mono, 16kHz)


        res.json({ text: `Hello Hey` });
    } catch (error) {
        console.log('Error:', error);
        res.status(500).json({ error: 'Failed to transcribe' });
    } finally {
        await fs.unlink(mp3Path).catch(() => { });
        await fs.unlink(wavPath).catch(() => { });
    }
});

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



// Sum values if requested (e.g., tot// Helper to get safe group key value
const safeGroupValue = (value) => {
    if (value === undefined || value === null) return "(undefined)";
    if (value === "") return "(empty)";
    return value;
};

// Enhanced filter matching
// const matchesFilter = (candidate, contestObj, location, filter = {}) => {
//     const combined = {
//         ...candidate,
//         contest: contestObj.contest,
//         location_code: location.location_code
//     };

//     for (const [key, filterValue] of Object.entries(filter)) {
//         if (!(key in combined)) return false;
//         const value = combined[key];

//         // Handle range queries for numeric fields
//         if (typeof filterValue === 'object' && filterValue !== null) {
//             if ('min' in filterValue || 'max' in filterValue) {
//                 if (typeof value !== 'number') return false;
//                 if (filterValue.min !== undefined && value < filterValue.min) return false;
//                 if (filterValue.max !== undefined && value > filterValue.max) return false;
//             }
//             else if ('in' in filterValue && Array.isArray(filterValue.in)) {
//                 if (!filterValue.in.includes(value)) return false;
//             }
//             else if ('neq' in filterValue) {
//                 if (value === filterValue.neq) return false;
//             }
//             continue;
//         }

//         // Handle array filters
//         if (Array.isArray(filterValue)) {
//             if (!filterValue.includes(value)) return false;
//         }
//         else if (value !== filterValue) {
//             return false;
//         }
//     }
//     return true;
// };

// Create nested group structure
const createNestedGroups = (fields, candidate, contestObj, location, sumField) => {
    if (fields.length === 0) return {};

    const [currentField, ...remainingFields] = fields;

    let newCand = {
        ...candidate,
        contest: contestObj.contest,
        location: location.location_code
    }

    const value = safeGroupValue(newCand[currentField]);


    // Create nested structure for remaining fields
    const children = remainingFields.length > 0
        ? createNestedGroups(remainingFields, candidate, contestObj, location, sumField)
        : {
            items: [candidate],
            total: sumField ? (candidate[sumField] || 0) : 0
        };

    return {
        [value]: children
    };
};

// Merge nested group structures
const mergeNestedGroups = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
        if (!target[key]) {
            target[key] = value;
        } else {
            // If both are leaf nodes
            if (target[key].items && value.items) {
                target[key].items.push(...value.items);
                target[key].total += value.total || 0;
            }
            // If both are branch nodes
            else {
                mergeNestedGroups(target[key], value);
            }
        }
    }
    return target;
};


const matchesFilter = (candidate, contestObj, location, filter = {}) => {
    const combined = {
        ...candidate,
        contest: contestObj.contest,
        location_code: location.location_code
    };

    for (const [key, filterValue] of Object.entries(filter)) {
        if (!(key in combined)) return false;
        const value = combined[key];

        // Handle range queries
        if (typeof filterValue === 'object' && filterValue !== null) {
            if ('min' in filterValue || 'max' in filterValue) {
                if (typeof value !== 'number') return false;
                if (filterValue.min !== undefined && value < filterValue.min) return false;
                if (filterValue.max !== undefined && value > filterValue.max) return false;
            }
            else if ('in' in filterValue && Array.isArray(filterValue.in)) {
                if (filterValue.in.length > 0 && !filterValue.in.includes(value)) return false;
            }
            else if ('neq' in filterValue) {
                if (value === filterValue.neq) return false;
            }
            continue;
        }

        // Handle array filters
        if (Array.isArray(filterValue)) {
            if (filterValue.length > 0 && !filterValue.includes(value)) return false;
        }
        else if (value !== filterValue) {
            return false;
        }
    }
    return true;
};


// Get distinct values for filtering// Get distinct values with filtering

// Endpoint with filtering, grouping, and summing
app.post('/api/v1/group-values', (req, res) => {
    const { fieldToGroup, filter = {}, sumField, selectFields = [], excludeFields = [] } = req.body;

    if (!fieldToGroup) {
        return res.status(400).json({ error: 'fieldToGroup is required' });
    }

    try {
        const fields = Array.isArray(fieldToGroup) ? fieldToGroup : [fieldToGroup];
        let groupedResults = {};

        electionData.forEach(location => {
            location.result?.forEach(contestObj => {
                contestObj.candidates?.forEach(candidate => {
                    // Apply filters
                    if (!matchesFilter(candidate, contestObj, location, filter)) {
                        return;
                    }

                    // Apply field selection / exclusion
                    let filteredCandidate = { ...candidate };

                    if (selectFields.length > 0) {
                        filteredCandidate = Object.fromEntries(
                            Object.entries(filteredCandidate).filter(([key]) => selectFields.includes(key))
                        );
                    }

                    if (excludeFields.length > 0) {
                        excludeFields.forEach(field => delete filteredCandidate[field]);
                    }

                    // Create grouped structure
                    const candidateGroup = createNestedGroups(
                        fields,
                        filteredCandidate,
                        contestObj,
                        location,
                        sumField
                    );

                    groupedResults = mergeNestedGroups(groupedResults, candidateGroup);
                });
            });
        });

        res.json({
            groupedBy: fieldToGroup,
            filterUsed: filter,
            sumField: sumField || null,
            selectFields,
            excludeFields,
            resultCount: Object.keys(groupedResults).length,
            results: groupedResults
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// const getDistinctValues = (fields, filter = {}) => {
//     const result = {};
//     const valueSets = {};

//     // Initialize sets for each field
//     fields.forEach(field => {
//         valueSets[field] = new Set();
//         result[field] = [];
//     });

//     electionData.forEach(location => {
//         location.result?.forEach(contestObj => {
//             contestObj.candidates?.forEach(candidate => {
//                 // Apply filters
//                 if (!matchesFilter(candidate, contestObj, location, filter)) {
//                     return;
//                 }

//                 // Collect values for each requested field
//                 fields.forEach(field => {
//                     let value = candidate[field];

//                     // Handle location_code separately
//                     if (field === 'location_code') {
//                         value = location.location_code;
//                     }
//                     // Handle contest separately
//                     else if (field === 'contest') {
//                         value = contestObj.contest;
//                     }

//                     if (value !== undefined && value !== null) {
//                         valueSets[field].add(value);
//                     }
//                 });
//             });
//         });
//     });

//     // Convert sets to sorted arrays
//     fields.forEach(field => {
//         result[field] = Array.from(valueSets[field]).sort();
//     });

//     return result;
// };
// // New endpoint for distinct values
// // Enhanced distinct values endpoint
// app.post('/api/v1/distinct-values', (req, res) => {
//     try {
//         const { fields, filter = {} } = req.body;

//         if (!fields || !Array.isArray(fields)) {
//             return res.status(400).json({ error: 'fields array is required' });
//         }

//         const distinctValues = getDistinctValues(fields, filter);
//         res.json({
//             fields,
//             filterUsed: filter,
//             distinctValues
//         });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });



// Enhanced error handling middleware

// Utility: match filter
// const matchesFilter = (candidate, contestObj, location, filter) => {
//     return Object.entries(filter).every(([key, value]) => {
//         if (key === 'location_code') return location.location_code === value;
//         if (key === 'contest') return contestObj.contest === value;
//         return candidate[key] === value;
//     });
// };

const getDistinctValues = (fields, filter = {}, groupedFields = []) => {
    const result = {};
    const valueSets = {};

    // If grouping, use nested object structure
    const isGrouped = groupedFields.length > 0;

    // Initialize base structure
    if (isGrouped) {
        result.groups = {}; // groups[groupKey] = { fieldName: [distinctValues] }
    } else {
        fields.forEach(field => {
            valueSets[field] = new Set();
            result[field] = [];
        });
    }

    electionData.forEach(location => {
        location.result?.forEach(contestObj => {
            contestObj.candidates?.forEach(candidate => {
                if (!matchesFilter(candidate, contestObj, location, filter)) return;

                // Determine group key if grouped
                let groupKey = null;
                if (isGrouped) {
                    const groupValues = groupedFields.map(field => {
                        if (field === 'location_code') return location.location_code;
                        if (field === 'contest') return contestObj.contest;
                        return candidate[field];
                    });
                    groupKey = groupValues.join('|');

                    if (!result.groups[groupKey]) {
                        result.groups[groupKey] = {};
                        fields.forEach(field => {
                            result.groups[groupKey][field] = new Set();
                        });
                    }
                }

                // Collect values
                fields.forEach(field => {
                    let value = candidate[field];
                    if (field === 'location_code') value = location.location_code;
                    else if (field === 'contest') value = contestObj.contest;

                    if (value !== undefined && value !== null) {
                        if (isGrouped) {
                            result.groups[groupKey][field].add(value);
                        } else {
                            valueSets[field].add(value);
                        }
                    }
                });
            });
        });
    });

    // Convert Sets to arrays
    if (isGrouped) {
        Object.keys(result.groups).forEach(groupKey => {
            Object.keys(result.groups[groupKey]).forEach(field => {
                result.groups[groupKey][field] = Array.from(result.groups[groupKey][field]).sort();
            });
        });
    } else {
        fields.forEach(field => {
            result[field] = Array.from(valueSets[field]).sort();
        });
    }

    return result;
};

// API endpoint
app.post('/api/v1/distinct-values', (req, res) => {
    try {
        const { fields, filter = {}, groupedFields = [] } = req.body;

        if (!fields || !Array.isArray(fields) || fields.length === 0) {
            return res.status(400).json({ error: 'fields array is required' });
        }

        const distinctValues = getDistinctValues(fields, filter, groupedFields);
        res.json({
            fields,
            filterUsed: filter,
            groupedFields,
            distinctValues
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



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

    // ActionWorker.start();
    SchedulerWorker.init()

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