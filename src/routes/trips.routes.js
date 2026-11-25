// src/routes/trips.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const c = require('../controllers/trips.controller');

const rules = [
  body('vehicle_id').notEmpty(),
  body('start_date').isISO8601(),
  body('start_location').notEmpty(),
  body('expected_end_date').optional({ values: 'falsy' }).isISO8601(),
  body('freight_amount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
];

router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', rules, validate, c.create);
router.put('/:id', rules, validate, c.update);
router.patch('/:id/status',
  body('status').isIn(['scheduled', 'running', 'completed', 'cancelled']),
  body('actual_end_date').optional({ values: 'falsy' }).isISO8601(),
  validate, c.changeStatus);
router.delete('/:id', c.remove);
// payments
router.post('/:id/payments',
  body('amount').isFloat({ min: 0 }),
  body('payment_date').isISO8601(),
  body('mode').optional({ values: 'falsy' }).isIn(['cash', 'upi', 'bank', 'card']),
  validate, c.addPayment);
router.delete('/:id/payments/:paymentId', c.deletePayment);
module.exports = router;
