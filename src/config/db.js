// src/config/db.js
const { Pool, types } = require('pg');
const env = require('./env');

// Return DATE columns as plain 'YYYY-MM-DD' strings. Without this, pg builds a JS Date
// at local midnight, which serialises to the previous day in UTC for IST (+05:30).
types.setTypeParser(1082, (v) => v);
// Return NUMERIC (money, litres, km) and BIGINT (ids, COUNT) as JS numbers instead of strings.
// Safe here: money is NUMERIC(12,2) and ids/counts stay far below 2^53.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

// sslmode in the URL would override the ssl option below (pg treats require as verify-full),
// so strip it and configure SSL here only.
const connectionString = env.databaseUrl.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected idle client error', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
