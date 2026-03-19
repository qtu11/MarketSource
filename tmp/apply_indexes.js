require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || 6543}/${process.env.DB_NAME || 'postgres'}`,
  ssl: process.env.DB_SSL === 'disable' ? false : { rejectUnauthorized: false }
});

async function applyIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email_deleted ON users (email, deleted_at)',
    'CREATE INDEX IF NOT EXISTS idx_products_cat_active_deleted ON products (category, is_active, deleted_at)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_type_status_deleted ON transactions (type, status, deleted_at)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_read_deleted ON notifications (user_id, is_read, deleted_at)',
    'CREATE INDEX IF NOT EXISTS idx_purchases_user_created ON purchases (user_id, created_at)'
  ];

  console.log('🚀 Starting index application...');
  for (const sql of indexes) {
    try {
      await pool.query(sql);
      console.log(`✅ Applied: ${sql}`);
    } catch (err) {
      console.error(`❌ Failed: ${sql}`, err.message);
    }
  }
  await pool.end();
  console.log('🏁 Finished.');
}

applyIndexes();
