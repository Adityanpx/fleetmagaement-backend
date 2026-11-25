// src/routes/dashboard.routes.js
const router = require('express').Router();
const c = require('../controllers/dashboard.controller');
router.get('/', c.summary);
module.exports = router;
