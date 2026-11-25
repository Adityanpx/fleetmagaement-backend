// src/routes/reports.routes.js
const router = require('express').Router();
const c = require('../controllers/reports.controller');
router.get('/trips', c.trips);
router.get('/vehicles', c.vehicles);
router.get('/expenses', c.expenses);
router.get('/fuel', c.fuel);
router.get('/drivers', c.drivers);
router.get('/companies', c.companies);
module.exports = router;
