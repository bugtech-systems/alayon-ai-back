
// 📁 db.js
import mongoose from 'mongoose';
const connectDB = async () => {
    await mongoose.connect('mongodb://localhost:27017/alayon ');
    console.log('MongoDB connected');
};
export default connectDB;
