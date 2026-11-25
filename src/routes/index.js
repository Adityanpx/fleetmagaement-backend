// src/routes/index.js
// Mounts everything under /api. Only /api/auth/login is public.
const router = require('express').Router();
const requireAuth = require('../middleware/auth');

router.use('/auth', require('./auth.routes'));

// everything below requires a valid token
router.use(requireAuth);
router.use('/vehicles', require('./vehicles.routes'));
router.use('/companies', require('./companies.routes'));
router.use('/trips', require('./trips.routes'));
router.use('/', require('./expenses.routes')); // /trips/:tripId/expenses & /expenses/:id
router.use('/dashboard', require('./dashboard.routes'));
router.use('/reports', require('./reports.routes'));

module.exports = router;
