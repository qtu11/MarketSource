
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testConnection() {
  const databaseUrl = process.env.DATABASE_URL;
  console.log('Testing connection to:', databaseUrl.split('@')[1]); // Hide credentials

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    const result = await pool.query('SELECT NOW() as now, version() as version');
    console.log('✅ Connection successful!');
    console.log('Time:', result.rows[0].now);
    console.log('Version:', result.rows[0].version);
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    if (error.code) console.error('Code:', error.code);
  } finally {
    await pool.end();
  }
}

testConnection();
