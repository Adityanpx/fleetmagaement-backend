// src/middleware/errorHandler.js
const env = require('../config/env');

// 404 for unmatched routes
function notFound(req, res, next) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}

// Map common Postgres errors to client errors instead of 500s.
function fromPg(err) {
  switch (err.code) {
    case '22P02': // invalid_text_representation (e.g. /vehicles/abc)
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
    case '22003': // numeric_value_out_of_range
      return { status: 400, error: 'Invalid input value' };
    case '23503': // foreign_key_violation
      return { status: 400, error: 'Referenced record does not exist' };
    case '23505': // unique_violation
      return { status: 409, error: 'Record already exists' };
    case '23514': // check_violation
      return { status: 400, error: 'Value not allowed' };
    case '23502': // not_null_violation
      return { status: 400, error: `Missing required field: ${err.column || 'unknown'}` };
    default:
      return null;
  }
}

// central error handler
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const pg = err.isApiError ? null : fromPg(err);
  if (pg) return res.status(pg.status).json({ error: pg.error });

  const status = err.statusCode || err.status || 500;
  const body = { error: err.message || 'Internal server error' };
  if (err.details) body.details = err.details;
  if (status >= 500) {
    console.error(err);
    if (env.nodeEnv === 'production') body.error = 'Internal server error';
  }
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
