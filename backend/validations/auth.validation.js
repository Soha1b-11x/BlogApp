// This file defines validation rules for authentication endpoints (register, login, admin login)
// Uses Joi library to check if the data sent by users is valid before processing it

import Joi from 'joi';

/**
 * Validation schema for user registration
 * Checks name, email, and password meet requirements
 */
const registerSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(50)
    .required()
    .messages({ //error messages
      'string.min': 'Name must be at least 2 characters',
      'string.max': 'Name cannot exceed 50 characters',
      'any.required': 'Name is required'
    }),
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(6)
    .required()
    .messages({
      'string.min': 'Password must be at least 6 characters',
      'any.required': 'Password is required'
    })
});

/**
 * Validation schema for user login
 * Checks email and password are provided
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

/**
 * Validation schema for admin login
 * Admins login with adminId instead of email
 */
const adminLoginSchema = Joi.object({
  adminId: Joi.string()
    .required()
    .messages({
      'any.required': 'Admin ID is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

export { registerSchema, loginSchema, adminLoginSchema };