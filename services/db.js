
// 📁 db.js
import mongoose from 'mongoose';
const connectDB = async () => {
    // await mongoose.connect('mongodb://localhost:27017/alayon_resources');
    await mongoose.connect(
      "mongodb://admin:wildcrackDBmong0@192.168.1.100:28017/admin"
    );

    console.log('MongoDB connected');
};
export default connectDB;
