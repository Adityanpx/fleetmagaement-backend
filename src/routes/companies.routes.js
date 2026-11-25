// src/routes/companies.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const c = require('../controllers/companies.controller');

router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', body('name').notEmpty(), validate, c.create);
router.put('/:id', body('name').notEmpty(), validate, c.update);
router.delete('/:id', c.remove);
module.exports = router;
