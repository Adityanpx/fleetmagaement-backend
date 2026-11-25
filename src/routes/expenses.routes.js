// src/routes/expenses.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const c = require('../controllers/expenses.controller');

const categories = ['diesel', 'toll', 'food', 'fine', 'parking', 'loading_unloading', 'tyre', 'repair', 'other'];

const rules = [
  body('category').isIn(categories),
  body('paid_by').isIn(['ourselves', 'company']),
  body('expense_date').isISO8601(),
  body('mode').optional({ values: 'falsy' }).isIn(['cash', 'upi', 'bank', 'card']),
];

// nested under a trip
router.get('/trips/:tripId/expenses', c.listForTrip);
router.post('/trips/:tripId/expenses', rules, validate, c.create);
// standalone by id
router.put('/expenses/:id', rules, validate, c.update);
router.delete('/expenses/:id', c.remove);
module.exports = router;
