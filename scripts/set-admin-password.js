// Usage: node scripts/set-admin-password.js "NewStrongPassword" [admin@redant.co.uk]
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, run } = require('../db');

(async () => {
  const [password, email = 'admin@redant.co.uk'] = process.argv.slice(2);
  if (!password || password.length < 12) {
    console.error('Provide a password of at least 12 characters.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const result = await run('UPDATE users SET password_hash = ? WHERE email = ?', [hash, email.toLowerCase()]);
  console.log(result.rowCount ? `Password updated for ${email}` : `No user found with email ${email}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
