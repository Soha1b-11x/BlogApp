// =============================================================================
// auth.controller.js — Handles user registration, login, logout, and token refresh
// =============================================================================
// This file contains all the authentication logic. When a user registers or
// logs in, we create JWT tokens (access token + refresh token) and store them
// in HTTP-only cookies. The refresh endpoint lets the frontend get a new access
// token without logging in again.
// =============================================================================

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { registerSchema, loginSchema } from '../validations/auth.validation.js';

// -----------------------------------------------------------------------------
// Register a new user account
// -----------------------------------------------------------------------------
export const register = async (req, res) => {
  try {
    // 1. Validate the incoming data using our Joi schema
    const { error } = registerSchema.validate(req.body);

    // 2. If validation fails, stop here and send back the error message
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    // 3. Get the registration details sent by the frontend
    const { name, email, password } = req.body;
    console.log(`Registering a new user account for ${email}`);

    // 4. Check if a user with this email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // 5. Hash the password before storing it in the database
    //    genSalt(10) creates a random string to make the hash unique
    //    bcrypt.hash() combines the password with the salt to create a secure hash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 6. Create the new user in the database with the hashed password
    const user = await User.create({
      name,
      email,
      password: hashedPassword
    });

    // 7. Create an access token (short-lived, 15 minutes)
    //    This token is sent with every API request to prove the user is logged in
    //    jwt.sign() takes: payload (data inside token), secret key, and options
    const accessToken = jwt.sign(
      { userId: user._id },           // payload — the data stored inside the token
      process.env.JWT_ACCESS_SECRET,   // secret key used to sign the token
      { expiresIn: '15m' }            // token expires in 15 minutes
    );

    // 8. Create a refresh token (long-lived, 7 days)
    //    This token is used to get a new access token when the old one expires
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }             // token expires in 7 days
    );

    // 9. Decide cookie settings based on environment
    //    Cross-site cookies (frontend and backend on different domains) require
    //    sameSite: 'none' and secure: true, or the browser will silently block them
    const isProduction = process.env.NODE_ENV === 'production';

    // 10. Store the access token in an HTTP-only cookie
    //     HTTP-only means JavaScript in the browser cannot read it (prevents XSS attacks)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 15 * 60 * 1000          // 15 minutes in milliseconds
    });

    // 11. Store the refresh token in an HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
    });

    // 12. Build the user data to send back (remove password for security)
    const userResponse = user.toObject();
    delete userResponse.password;

    // 13. Send the new user back to the frontend
    console.log(`User account created successfully: ${user._id}`);
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: { user: userResponse }
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
// Log in an existing user
// -----------------------------------------------------------------------------
export const login = async (req, res) => {
  try {
    // 1. Validate the incoming data using our Joi schema
    const { error } = loginSchema.validate(req.body);

    // 2. If validation fails, stop here and send back the error message
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    // 3. Get the login credentials sent by the frontend
    const { email, password } = req.body;
    console.log(`Login attempt received for ${email}`);

    // 4. Find the user by email
    //    We need the password field to compare it (it's not returned by default in queries)
    const user = await User.findOne({ email });
    if (!user) {
      console.warn(`Login failed: no user found for ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // 5. Compare the plain text password with the hashed password in the database
    //    bcrypt.compare() returns true if they match, false if they don't
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.warn(`Login failed: incorrect password for ${email}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // 6. Create an access token (short-lived, 15 minutes)
    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // 7. Create a refresh token (long-lived, 7 days)
    const refreshToken = jwt.sign(
      { userId: user._id },
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

    // 9. Remove the password from the user object before sending it to the frontend
    const userResponse = user.toObject();
    delete userResponse.password;

    // 10. Send the user data back
    console.log(`User logged in successfully: ${user._id}`);
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user: userResponse }
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
// Log out the current user by clearing their auth cookies
// -----------------------------------------------------------------------------
export const logout = (req, res) => {
  // 1. Remove both authentication cookies from the browser
  //    clearCookie must use matching sameSite/secure options or the browser won't clear them
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);

  console.log('User logged out and authentication cookies were cleared');

  // 2. Send a success response
  return res.status(200).json({
    success: true,
    message: 'Logout successful',
    data: null
  });
};

// -----------------------------------------------------------------------------
// Refresh the access token using the refresh token cookie
// -----------------------------------------------------------------------------
export const refresh = async (req, res) => {
  try {
    // 1. Get the refresh token from cookies
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not found'
      });
    }

    // 2. Verify the refresh token is valid and not expired
    //    jwt.verify() throws an error if the token is invalid or expired
    const decodedToken = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // 3. Find the user that this token belongs to
    const user = await User.findById(decodedToken.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 4. Create a new access token (the refresh token stays the same)
    const newAccessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // 5. Replace only the access token cookie (keep the refresh token cookie as-is)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'strict',
      maxAge: 15 * 60 * 1000
    });

    // 6. Send success response
    console.log(`Access token refreshed for user: ${user._id}`);
    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: null
    });

  } catch (error) {
    // Handle expired refresh token specifically
    if (error.name === 'TokenExpiredError') {
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'strict',
      };
      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
      console.warn('Refresh token expired; authentication cookies were cleared');
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired. Please login again.'
      });
    }

    // Handle any other token error (invalid, tampered, etc.)
    console.warn('Invalid refresh-token attempt');
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
};
