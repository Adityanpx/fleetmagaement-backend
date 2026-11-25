// src/db/applySchema.js
// Applies schema.sql to the database in DATABASE_URL (alternative to pasting it in the Supabase SQL editor).
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

pool.query(sql)
  .then(() => { console.log('Schema applied.'); return pool.end(); })
  .catch((e) => {
    console.error('Schema failed:', e.message);
    pool.end();
    process.exit(1);
  });
