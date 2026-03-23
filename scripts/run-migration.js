/**
 * Lightweight SQL migration runner.
 *
 * Applies all `migrations/*.sql` in lexicographic order, while tracking applied files in:
 *   public.__marketsource_sql_migrations (filename primary key)
 *
 * Usage:
 *   npm run migrate
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config();

function buildDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.POSTGRES_URL
  );
}

function buildConnectionStringFromDiscreteVars() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const db = process.env.DB_NAME || 'postgres';
  const port = process.env.DB_PORT || '5432';

  if (!host || !user || !password) return null;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

async function main() {
  const databaseUrl = buildDatabaseUrl() || buildConnectionStringFromDiscreteVars();

  if (!databaseUrl) {
    console.error('❌ Missing database connection. Set DATABASE_URL (recommended) or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.');
    process.exit(1);
  }

  const migrationsDir = path.resolve(__dirname, '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DB_SSL === 'disable'
      ? undefined
      : {
          rejectUnauthorized: false,
        },
  });

  const migrationTable = 'public.__marketsource_sql_migrations';

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${migrationTable} (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No SQL migrations found. Skipping.');
      return;
    }

    console.log(`Applying ${files.length} SQL migration(s) from ${migrationsDir}...`);

    for (const filename of files) {
      const already = await client.query(
        `SELECT 1 FROM ${migrationTable} WHERE filename = $1`,
        [filename]
      );
      if (already.rows.length > 0) {
        console.log(`- Skip (already applied): ${filename}`);
        continue;
      }

      const fullPath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(fullPath, 'utf8');

      console.log(`- Applying: ${filename}`);
      await client.query(sql);

      await client.query(
        `INSERT INTO ${migrationTable} (filename) VALUES ($1)`,
        [filename]
      );
    }

    console.log('✅ SQL migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Migration runner failed:', err);
  process.exit(1);
});

