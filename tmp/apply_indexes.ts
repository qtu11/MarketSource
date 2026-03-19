import * as pg from '../lib/database';
import { logger } from '../lib/logger';

async function applyIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email_deleted ON users (email, deleted_at)',
    'CREATE INDEX IF NOT EXISTS idx_products_cat_active_deleted ON products (category, is_active, deleted_at)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_type_status_deleted ON transactions (type, status, deleted_at)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_read_deleted ON notifications (user_id, is_read, deleted_at)',
    'CREATE INDEX IF NOT EXISTS idx_purchases_user_created ON purchases (user_id, created_at)'
  ];

  for (const sql of indexes) {
    try {
      await pg.query(sql);
      console.log(`✅ Applied: ${sql}`);
    } catch (err) {
      console.error(`❌ Failed: ${sql}`, err);
    }
  }
}

applyIndexes().then(() => process.exit(0));
