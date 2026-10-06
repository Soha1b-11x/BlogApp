// =============================================================================
// user.controller.js — Handles user profile viewing, updating, and deletion
// =============================================================================
// This file contains the logic for the logged-in user to:
// - View their own profile
// - View their own posts
// - Update their name and/or avatar
// - Delete their account and all associated content
// =============================================================================

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Post from '../models/Post.js';
import User from '../models/User.js';
import Comment from '../models/Comment.js';

// Set up __dirname for ES modules (needed to build file paths)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '..', 'uploads');

// -----------------------------------------------------------------------------
// Get the logged-in user's profile
// -----------------------------------------------------------------------------
export const getProfile = async (req, res) => {
  try {
    // 1. The auth middleware already found the user and put it in req.user
    console.log(`Fetching profile for user: ${req.user._id}`);

    // 2. Send the user's profile back
    return res.status(200).json({
      success: true,
      message: 'Profile fetched successfully',
      data: { user: req.user }
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
// Get all posts written by the logged-in user
// -----------------------------------------------------------------------------
export const getUserPosts = async (req, res) => {
  try {
    // 1. Get the logged-in user's ID
    const userId = req.user._id;
    console.log(`Fetching posts for user: ${userId}`);

    // 2. Find all posts by this user
    const posts = await Post.find({ author: userId })
      .sort({ createdAt: -1 })
      .populate('author', 'name email avatar')
      .lean();

    // 3. Add likesCount and commentsCount to each post
    const postsWithCounts = posts.map((post) => {
      return {
        ...post,
        likesCount: post.likes ? post.likes.length : 0,
        commentsCount: post.comments ? post.comments.length : 0
      };
    });

    // 4. Send the posts back
    return res.status(200).json({
      success: true,
      message: 'User posts fetched successfully',
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

// -----------------------------------------------------------------------------
// Update the logged-in user's profile (name and/or avatar)
// -----------------------------------------------------------------------------
export const updateProfile = async (req, res) => {
  try {
    // 1. Find the user in the database (we need the full document to update it)
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 2. If a new name was provided, update it
    if (req.body.name) {
      user.name = req.body.name;
    }

    // 3. If a new avatar image was uploaded, replace the old one
    if (req.file) {
      // Delete the old avatar image if one exists
      if (user.avatar) {
        try {
          await fs.unlink(path.join(uploadDir, user.avatar));
        } catch (unlinkError) {
          if (unlinkError.code !== 'ENOENT') {
            console.error(`Unable to delete old avatar ${user.avatar}:`, unlinkError.message);
          }
        }
      }
      // Save the new avatar filename
      user.avatar = req.file.filename;
    }

    // 4. Save the updated user to the database
    await user.save();

    // 5. Build the user data to send back (remove password for security)
    const userResponse = user.toObject();
    delete userResponse.password;

    // 6. Send the updated profile back
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: userResponse }
    });

  } catch (error) {
    // If saving failed after uploading a new avatar, clean up the unused file
    if (req.file) {
      try {
        await fs.unlink(path.join(uploadDir, req.file.filename));
      } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') {
          console.error(`Unable to delete uploaded avatar ${req.file.filename}:`, unlinkError.message);
        }
      }
    }

    console.log(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// -----------------------------------------------------------------------------
// Delete the logged-in user's account and all their content
// -----------------------------------------------------------------------------
export const deleteProfile = async (req, res) => {
  try {
    // 1. Find the user in the database
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 2. Find all posts by this user
    const userPosts = await Post.find({ author: user._id });

    // 3. Delete each post's cover image from the uploads folder
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

    // 4. Delete all comments by this user
    await Comment.deleteMany({ author: user._id });

    // 5. Delete all posts by this user
    await Post.deleteMany({ author: user._id });

    // 6. Delete the user's avatar image if they have one
    if (user.avatar) {
      try {
        await fs.unlink(path.join(uploadDir, user.avatar));
      } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') {
          console.error(`Unable to delete avatar ${user.avatar}:`, unlinkError.message);
        }
      }
    }

    // 7. Delete the user account
    await User.findByIdAndDelete(req.user._id);

    // 8. Clear the authentication cookies so the browser is logged out
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
    };
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    // 9. Send success response
    return res.status(200).json({
      success: true,
      message: 'Profile and all associated content deleted successfully',
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
