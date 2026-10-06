// =============================================================================
// server.js — Main entry point for the Blog API
// =============================================================================
// This file starts the Express server, connects to MongoDB, sets up middleware
// (CORS, JSON parsing, cookies, static files), and registers all API routes.
// =============================================================================

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// __dirname is not available in ES modules, so we create it manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the .env file (must happen before other imports use them)
config({ path: path.join(__dirname, '.env') });

// Now import the rest of the modules (they may need env variables)
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import errorHandler from './middlewares/error.middleware.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import commentRoutes from './routes/comment.routes.js';
import postRoutes from './routes/post.routes.js';
import userRoutes from './routes/user.routes.js';

// Create the Express application
const app = express();
const port = process.env.PORT || 5000;

const startServer = async () => {
  console.log('Starting the Blog API server...');

  // 1. Connect to MongoDB
  await connectDB();

  // 2. Set up CORS — allow the frontend to send cookies with cross-origin requests
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  app.use(cors({
    origin: clientUrl,
    credentials: true
  }));

  // 3. Parse incoming JSON bodies, URL-encoded form data, and cookies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // 4. Serve uploaded images as static files at /uploads
  const uploadsDirectoryPath = path.join(__dirname, 'uploads');
  app.use('/uploads', express.static(uploadsDirectoryPath));

  // 5. Register all API routes
  app.use('/api/auth', authRoutes);       // Register, login, logout, refresh tokens
  app.use('/api/posts', postRoutes);      // Create, read, update, delete posts + likes
  app.use('/api', commentRoutes);         // Create and delete comments
  app.use('/api/users', userRoutes);      // User profile and user's posts
  app.use('/api/admin', adminRoutes);     // Admin login, manage users and posts

  // 6. Health check endpoint — used to verify the server is running
  app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Server is running' });
  });

  // 7. Global error handler — must be registered AFTER all routes
  app.use(errorHandler);

  // 8. Start listening for requests
  app.listen(port, () => {
    console.log(` Server is running on port ${port}`);
    console.log(` Health check: http://localhost:${port}/api/health`);
  });
};

startServer();
