import mongoose from 'mongoose';

const connectDB = async() => {
    try {
        console.log("STart conecting")
            // Connect to MongoDB using the URI from the .env file
        const conn = await mongoose.connect("mongodb+srv://blogApp:blogApp@blogapp.lptatz8.mongodb.net/?appName=blogApp");

        // Log which database host we connected to
        console.log(` MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        // If connection fails, log the error and stop the application
        console.error(` MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

connectDB()

// export default connectDB;