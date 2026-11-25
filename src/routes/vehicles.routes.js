// src/routes/vehicles.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const c = require('../controllers/vehicles.controller');

const rules = [
  body('number').notEmpty(),
  body('brand').notEmpty(),
  body('emi_due_day').optional({ values: 'falsy' }).isInt({ min: 1, max: 31 }),
  body(['insurance_expiry', 'fitness_expiry', 'permit_expiry', 'puc_expiry'])
    .optional({ values: 'falsy' }).isISO8601(),
];

router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', rules, validate, c.create);
router.put('/:id', rules, validate, c.update);
router.delete('/:id', c.remove);
module.exports = router;
