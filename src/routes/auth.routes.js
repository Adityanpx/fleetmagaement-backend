// src/routes/auth.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const requireAuth = require('../middleware/auth');
const c = require('../controllers/auth.controller');

router.post('/login',
  body('username').isString().notEmpty(),
  body('password').isString().notEmpty(),
  validate, c.login);
router.get('/me', requireAuth, c.me);
module.exports = router;
