// =============================================================================
// admin.controller.js — Handles admin login and admin-only management actions
// =============================================================================
// This file contains the logic for admin authentication and admin dashboard
// actions: logging in as admin, listing all users, deleting users (and their
// content), and listing all posts for moderation.
// =============================================================================

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { adminLoginSchema } from '../validations/auth.validation.js';

// Set up __dirname for ES modules (needed to build file paths)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '..', 'uploads');

// -----------------------------------------------------------------------------
// Log in as an administrator using admin ID and password
// -----------------------------------------------------------------------------
export const adminLogin = async (req, res) => {
  try {
    // 1. Validate the incoming data using our Joi schema
    const { error } = adminLoginSchema.validate(req.body);

    // 2. If validation fails, stop here and send back the error message
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    // 3. Get the admin credentials from the request body
    const { adminId, password } = req.body;
    console.log(`Admin login attempt received for ID: ${adminId}`);

    // 4. Find a user with this adminId who has the "admin" role
    const admin = await User.findOne({ adminId, role: 'admin' });
    if (!admin) {
      console.warn(`Admin login failed: no administrator found for ID ${adminId}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // 5. Compare the plain text password with the hashed password in the database
    //    bcrypt.compare() returns true if they match, false if they don't
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      console.warn(`Admin login failed: incorrect password for ID ${adminId}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // 6. Create an access token (short-lived, 15 minutes)
    const accessToken = jwt.sign(
      { userId: admin._id },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // 7. Create a refresh token (long-lived, 7 days)
    const refreshToken = jwt.sign(
      { userId: admin._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // 8. Store both tokens in HTTP-only cookies
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 15 * 60 * 1000
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // 9. Remove the password from the response before sending it
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    // 10. Send the admin user data back
    console.log(`Administrator logged in successfully: ${admin._id}`);
    return res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: { user: adminResponse }
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// -----------------------------------------------------------------------------
// Get a list of all regular users (for the admin dashboard)
// -----------------------------------------------------------------------------
export const getAllUsers = async (req, res) => {
  try {
    console.log('Administrator requested the user list');

    // 1. Find all users with role "user" (exclude admins from the list)
    const users = await User.find({ role: 'user' })
      .select('-password')           // don't include passwords
      .sort({ createdAt: -1 });      // newest users first

    // 2. Send the list back
    return res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: { users }
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// -----------------------------------------------------------------------------
// Delete a user and all their content (posts, comments, images)
// -----------------------------------------------------------------------------
export const deleteUser = async (req, res) => {
  try {
    // 1. Find the user to delete
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 2. Don't allow deleting other admins
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin user'
      });
    }

    console.log(`Administrator is deleting user: ${user._id}`);

    // 3. Find all posts by this user
    const userPosts = await Post.find({ author: user._id });

    // 4. Delete each post's cover image from the uploads folder
    for (const post of userPosts) {
      if (post.coverImage) {
        try {
          await fs.unlink(path.join(uploadDir, post.coverImage));
        } catch (unlinkError) {
          if (unlinkError.code !== 'ENOENT') {
            console.error(`Unable to delete uploaded image ${post.coverImage}:`, unlinkError.message);
          }
        }
      }
    }

    // 5. Delete all comments by this user
    await Comment.deleteMany({ author: user._id });

    // 6. Delete all posts by this user
    await Post.deleteMany({ author: user._id });

    // 7. Delete the user account itself
    await User.findByIdAndDelete(req.params.id);

    // 8. Send success response
    console.log(`User deleted successfully: ${req.params.id}`);
    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
      data: null
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// -----------------------------------------------------------------------------
// Get all posts (for the admin dashboard)
// -----------------------------------------------------------------------------
export const getAllPosts = async (req, res) => {
  try {
    console.log('Administrator requested the post list');

    // 1. Fetch all posts with author info
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate('author', 'name email avatar')
      .lean();

    // 2. Add likesCount and commentsCount to each post
    const postsWithCounts = posts.map((post) => {
      return {
        ...post,
        likesCount: post.likes ? post.likes.length : 0,
        commentsCount: post.comments ? post.comments.length : 0
      };
    });

    // 3. Send the posts back
    return res.status(200).json({
      success: true,
      message: 'All posts fetched successfully',
      data: { posts: postsWithCounts }
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
