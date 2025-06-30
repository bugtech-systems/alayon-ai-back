// 📂 routes/resourceRoutes.js
import express from 'express';
import { QueryBuilder } from './services/queryBuilder.js';
import { QueryExecutor } from './services/queryExecutor.js';
import { ContextAwareQueryBuilder } from './services/contextAwareBuilder.js';
import { PromptService } from './services/promptServices.js';
import ollama from 'ollama';
import { createSession, getSession } from '../services/sessionStore.js';
import { getFilteredResources, getResourceFields } from '../services/resourceService.js';
import { determineConfirm, validateRequiredFields } from '../utils/helpers.js';


const router = express.Router();
const queryBuilder = new QueryBuilder();
const queryContextBuilder = new ContextAwareQueryBuilder();
const promptService = new PromptService(ollama);

router.post('/generate-query', async (req, res) => {
    const { prompt, context, sessionId } = req.body;

    const session = getSession(sessionId) || createSession(sessionId);

    const fields = await getResourceFields((session.resourceName || session.name));
    session.requiredFields = fields;

    let dataContext = {
        ...context,
        ...session
    }














    const resp = await promptService.generateQuery(prompt, dataContext);







    session.history.push({
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString()
    });


    console.log(resp, 'RESPONSE')

    let resData = JSON.parse(resp.response);
    console.log(resData, 'RESS', resp)
    session.history.push({
        role: 'assistant',
        content: resp.response
    });




    let confirmAction = await determineConfirm(prompt);
    console.log({ ...session, ...session?.partialData }, 'SESSSS')
    if (confirmAction && session.intent != 'find') {
        const query = await queryBuilder.buildQueryContext({ ...session, ...session?.partialData });
        console.log('Generated query:', JSON.stringify(query, null, 2));
        if (query.mongoQuery) {
            const result = await QueryExecutor.execute(query.mongoQuery);
            session.results = result;
            session.intent = null;
            session.latestQuery = {};
            session.partialData = {};
            session.history = []
        }
    }






    session.partialData = { ...session.partialData, ...resData?.response?.data, ...resData?.data };
    session.intent = resData?.intent ? resData?.intent : resData?.response?.intent;


    if (session.intent == 'find' && session.resourceName) {




        let query = await getFilteredResources(session.resourceName, session.partialData);
        const query1 = await queryBuilder.buildQueryContext({ ...resData, intent: 'find', ...session, values: [session?.partialData] });
        console.log('Generated query:', JSON.stringify(query, null, 2));
        if (query1.mongoQuery) {
            const result = await QueryExecutor.execute(query1.mongoQuery);
            session.results = result;
            session.intent = null;
            session.history = []
        }
        console.log(query, 'ressult', query1)
        if (query) {
            session.results = query;
            session.latestData = query;
        }
    }



    const { missingFields, followUpQuestions, confirm } = await validateRequiredFields(session.intent, session.partialData, session.requiredFields)










    if (missingFields.length) {
        session.confirm = true
        session.confirmedFields = missingFields;
        session.requiredFields = []
    }


    session.resourceName = (resData?.response?.resourceName || resData?.resourceName || session?.partialData.name)
    session.latestQuery = (resData.query || resData.data);




    console.log(session, 'sesss', missingFields, followUpQuestions, confirm)

    res.json({ followup: followUpQuestions[0], ...resData, results: session.results });
});

// Logging middleware for all requests
router.use((req, _, next) => {
    console.log('\n=== NEW REQUEST ===');
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    next();
});


router.post('/query', async (req, res) => {
    try {
        console.log('\n[QUERY ENDPOINT] Received request with body:', JSON.stringify(req.body, null, 2));

        const { prompt } = req.body;
        console.log(`Processing prompt: "${prompt}"`);

        // Step 1: Build the query from natural language
        const query = await queryBuilder.buildQueryFromPrompt(prompt);
        console.log('Generated query:', JSON.stringify(query, null, 2));

        // Step 2: Execute the query
        console.log('Executing MongoDB query...');
        const result = await QueryExecutor.execute(query.mongoQuery);
        console.log('Query execution result:', JSON.stringify(result, null, 2));

        const response = {
            success: true,
            query,
            result
        };

        console.log('Sending response:', JSON.stringify(response, null, 2));
        res.json(response);
    } catch (error) {
        console.error('Error in /query endpoint:', error);
        const errorResponse = {
            success: false,
            error: error.message
        };
        console.log('Sending error response:', JSON.stringify(errorResponse, null, 2));
        res.status(500).json(errorResponse);
    }
});

router.get('/conversation-history', (req, res) => {
    try {
        console.log('\n[CONVERSATION HISTORY] Fetching history...');
        const history = queryBuilder.conversationHistory;
        console.log(`Found ${history.length} conversation entries`);
        console.log('History content:', JSON.stringify(history, null, 2));

        res.json(history);
    } catch (error) {
        console.error('Error fetching conversation history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve conversation history'
        });
    }
});

router.post('/process', async (req, res) => {
    try {
        console.log('\n[PROCESS ENDPOINT] Received request with body:', JSON.stringify(req.body, null, 2));

        const { prompt, providedData = [] } = req.body;
        console.log(`Processing prompt: "${prompt}"`);
        console.log('Provided data:', JSON.stringify(providedData, null, 2));

        // Process the prompt with context
        const response = await queryContextBuilder.processPrompt(prompt, providedData);
        console.log('Context-aware response:', JSON.stringify(response, null, 2));

        // Execute if ready
        if (!response.followup && response.confirm) {
            console.log('No followup needed, executing query...');
            const result = await QueryExecutor.execute(response.query);
            console.log('Execution result:', JSON.stringify(result, null, 2));
            response.result = result;
        }

        console.log('Sending final response:', JSON.stringify(response, null, 2));
        res.json(response);
    } catch (error) {
        console.error('Error in /process endpoint:', error);
        const errorResponse = {
            success: false,
            error: error.message
        };
        console.log('Sending error response:', JSON.stringify(errorResponse, null, 2));
        res.status(500).json(errorResponse);
    }
});

router.post('/execute-confirmed', async (req, res) => {
    try {
        console.log('\n[EXECUTE CONFIRMED] Received request with body:', JSON.stringify(req.body, null, 2));

        const { query } = req.body;
        console.log('Executing confirmed query:', JSON.stringify(query, null, 2));

        const result = await QueryExecutor.execute(query);
        console.log('Execution result:', JSON.stringify(result, null, 2));

        const successResponse = {
            success: true,
            result
        };
        console.log('Sending success response:', JSON.stringify(successResponse, null, 2));
        res.json(successResponse);
    } catch (error) {
        console.error('Error in /execute-confirmed endpoint:', error);
        const errorResponse = {
            success: false,
            error: error.message
        };
        console.log('Sending error response:', JSON.stringify(errorResponse, null, 2));
        res.status(500).json(errorResponse);
    }
});

// Log all responses before sending
router.use((req, res, next) => {
    const originalSend = res.send;
    res.send = function (body) {
        console.log('\n=== RESPONSE ===');
        console.log(`[${new Date().toISOString()}] Status: ${res.statusCode}`);
        console.log('Body:', typeof body === 'string' ? body : JSON.stringify(body, null, 2));
        originalSend.call(this, body);
    };
    next();
});




export default router;