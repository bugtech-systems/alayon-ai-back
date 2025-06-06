const express = require('express');
const path = require('path');
const configApi = require('./api/config');

const app = express();

// Use the API routes
app.use('/api', configApi);

// Serve static files (like config.json)
app.use(express.static(path.join(__dirname, 'public')));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});

