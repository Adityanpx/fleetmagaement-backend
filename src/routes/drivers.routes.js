// src/routes/drivers.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const c = require('../controllers/drivers.controller');

const rules = [
  body('name').notEmpty(),
  body('license_expiry').optional({ values: 'falsy' }).isISO8601(),
];

router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', rules, validate, c.create);
router.put('/:id', rules, validate, c.update);
router.delete('/:id', c.remove);
router.post('/:id/settlements',
  body('amount').isFloat({ min: 0 }),
  body('direction').isIn(['paid_to_driver', 'received_from_driver']),
  body('settle_date').isISO8601(), validate, c.addSettlement);
router.delete('/:id/settlements/:settlementId', c.deleteSettlement);
module.exports = router;
