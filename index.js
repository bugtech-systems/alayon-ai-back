


// 📁 server.js
import express from 'express';
import connectDB from './services/db.js';
import resourceTagRoutes from './routes/resourceTags.js';

const app = express();
connectDB();

app.use(express.json());
app.use('/api/resource-tags', resourceTagRoutes);

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



