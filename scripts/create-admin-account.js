const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL Connection URL from Env
let databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

if (!databaseUrl) {
    console.error('❌ DATABASE_URL is missing in .env file');
    process.exit(1);
}

// ✅ FIX: Force port 6543 for IPv4 compatibility (Session Pooler)
if (databaseUrl.includes(':5432/')) {
    databaseUrl = databaseUrl.replace(':5432/', ':6543/');
    if (!databaseUrl.includes('pgbouncer=true')) {
        databaseUrl += databaseUrl.includes('?') ? '&pgbouncer=true' : '?pgbouncer=true';
    }
}

console.log('🔗 Connecting to:', databaseUrl.split('@')[1]); // Log host part for safety

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
        rejectUnauthorized: false,
    },
});

async function createAdmin() {
    const email = 'admin@qtusdevmarket.com';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
        console.error('❌ ADMIN_PASSWORD is required (do not hardcode passwords)');
        process.exit(1);
    }
    const name = 'Admin Marketsource';
    const username = 'qtusadmin';
    const role = 'admin';

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        // Check if user exists
        const checkRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

        if (checkRes.rows.length > 0) {
            // Update existing user to admin
            await pool.query(
                'UPDATE users SET role = $1, password_hash = $2, name = $3, username = $4, updated_at = NOW() WHERE email = $5',
                [role, passwordHash, name, username, email]
            );
            console.log(`✅ User ${email} updated to ADMIN.`);
        } else {
            // Create new admin
            await pool.query(
                `INSERT INTO users (email, name, username, password_hash, role, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                [email, name, username, passwordHash, role]
            );
            // Never log plaintext password in console/logs.
            console.log(`✅ Admin account created: ${email}`);
        }

        // Also ensure this user exists in any other required tables if necessary
    } catch (error) {
        console.error('❌ Error creating admin:', error);
    } finally {
        await pool.end();
    }
}

createAdmin();
