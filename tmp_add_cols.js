require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100)');
    console.log('Added ip_address column');
  } catch (e) {
    console.log('Column ip_address might already exist or error:', e.message);
  }
  
  try {
    await pool.query('ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS device_info JSONB');
    console.log('Added device_info column');
  } catch (e) {
    console.log('Column device_info might already exist or error:', e.message);
  }
  
  await pool.end();
}

main();
