// Supabase (Postgres) data layer.
// Keeps the same run / get / all helpers the routes already use, so the
// rest of the app barely changes. Schema lives in supabase/schema.sql.
require('dotenv').config();
const { Pool, types } = require('pg');

// count(*) returns BIGINT, which pg gives back as a string. Return numbers instead.
types.setTypeParser(20, (v) => parseInt(v, 10));

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Add your Supabase connection string to .env or Vercel env vars.');
}

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 3,                      // keep small: each serverless instance has its own pool
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => console.error('Unexpected Postgres pool error', err));

// Convert SQLite style "?" placeholders into Postgres "$1, $2, ..."
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Run INSERT / UPDATE / DELETE. Returns { rowCount, rows }.
// For inserts that need the new id, end the SQL with "RETURNING id".
async function run(sql, params = []) {
  const result = await pool.query(toPg(sql), params);
  return { rowCount: result.rowCount, rows: result.rows };
}

// Return the first row or undefined.
async function get(sql, params = []) {
  const result = await pool.query(toPg(sql), params);
  return result.rows[0];
}

// Return all rows.
async function all(sql, params = []) {
  const result = await pool.query(toPg(sql), params);
  return result.rows;
}

module.exports = { pool, run, get, all };
