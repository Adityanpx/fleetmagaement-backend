// src/db/seed.js
const bcrypt = require('bcryptjs');
const { query, pool } = require('../config/db');
const env = require('../config/env');

async function seed() {
  if (!env.owner.password) {
    throw new Error('OWNER_PASSWORD is empty in .env — set it before seeding.');
  }
  const hash = await bcrypt.hash(env.owner.password, 10);
  await query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [env.owner.username, hash]
  );
  console.log(`Owner "${env.owner.username}" is ready.`);
}

seed()
  .then(() => pool.end())
  .catch((e) => {
    console.error('Seed failed:', e.message);
    pool.end();
    process.exit(1);
  });
