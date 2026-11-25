// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required'));
  try {
    req.user = jwt.verify(token, env.jwtSecret);
    next();
  } catch (e) {
    next(new ApiError(401, 'Invalid or expired token'));
  }
};
