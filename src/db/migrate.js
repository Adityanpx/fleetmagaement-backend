// src/db/migrate.js
// Runs every .sql file in src/db/migrations in name order. Each migration is written to be re-runnable.
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function run() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    console.log(`Applied ${f}`);
  }
}

run()
  .then(() => pool.end())
  .catch((e) => {
    console.error('Migration failed:', e.message);
    pool.end();
    process.exit(1);
  });
