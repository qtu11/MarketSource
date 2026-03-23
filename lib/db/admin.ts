import { logger } from '../logger';
import { PoolClient, Pool } from 'pg';
import { notificationEmitter, NOTIFICATION_EVENTS } from '../events';
import { normalizeUserId } from './users';
import { hasDownloadCountColumn } from './core';
import { pool, getPool, query, queryOne, withTransaction, getPoolInstance } from "./core";
export async function createAppSetting(settingData: {
  key: string
  value: string
  description?: string
}) {
  try {
    const result = await pool.query(
      "INSERT INTO app_settings (setting_key, setting_value, description, created_at, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id",
      [settingData.key, settingData.value, settingData.description || null]
    );
    return { id: result.rows[0].id };
  } catch (error) {
    logger.error("Error creating app setting", error, { settingData });
    return null;
  }
}
export async function getAdminActions(limit: number = 50) {
  try {
    const result = await pool.query(
      `SELECT aa.*, u.username as admin_name, u.email as admin_email
       FROM admin_actions aa
       JOIN users u ON aa.admin_id = u.id
       ORDER BY aa.created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (error) {
    logger.error("Error getting admin actions", error);
    throw error;
  }
}
export async function createAdminAction(actionData: {
  adminId: number
  action: string
  targetType?: string
  targetId?: string
  details?: Record<string, any>
}) {
  try {
    const result = await pool.query(
      `INSERT INTO admin_actions (admin_id, action, target_type, target_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP) RETURNING id`,
      [
        actionData.adminId,
        actionData.action,
        actionData.targetType || null,
        actionData.targetId || null,
        actionData.details || null,
      ]
    );
    return { id: result.rows[0].id };
  } catch (error) {
    logger.error("Error creating admin action", error, { actionData });
    throw error;
  }
}
export async function createNotification(data: {
  userId: number;
  type: string;
  title?: string;
  message: string;
  isRead?: boolean;
}) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [data.userId, data.type, data.title || null, data.message, data.isRead ?? false]
    );
    const notification = result.rows[0];

    // ✅ NEW: Phát sự kiện real-time qua EventEmitter (SSE)
    if (notificationEmitter) {
      notificationEmitter.emit(NOTIFICATION_EVENTS.NEW_NOTIFICATION, notification);
    }

    // ✅ NEW: Đồng bộ sang Firebase Realtime Database
    try {
      const { publishDashboardEvent } = await import('../realtime/events');
      await publishDashboardEvent('notifications', notification);
    } catch (err) {
      logger.error("Error syncing to Firebase Realtime", err);
    }

    return notification;
  } catch (error) {
    logger.error("Error creating notification", error, data);
    throw error;
  }
}
export async function getNotifications(userId: number, limit: number = 20) {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } catch (error) {
    logger.error("Error getting notifications", error, { userId });
    throw error;
  }
}
export async function getChats(
  userId?: number,
  adminId?: number,
  limit?: number,
  offset?: number
) {
  try {
    let query = `
      SELECT c.*, 
             u.username as user_name,
             u.email as user_email,
             u.avatar_url as user_avatar,
             COALESCE(a.username, 'Admin') as admin_name,
             COALESCE(a.email, '') as admin_email,
             CASE WHEN c.is_admin = true THEN true ELSE false END as is_admin
      FROM chats c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN users a ON c.admin_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND c.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (adminId) {
      query += ` AND c.admin_id = $${paramIndex}`;
      params.push(adminId);
      paramIndex++;
    }

    query += ' ORDER BY c.created_at ASC'; // âœ… FIX: ASC Ä‘á»ƒ hiá»ƒn thá»‹ tin nháº¯n cÅ© trÆ°á»›c, má»›i sau

    // âœ… FIX: ThĂªm pagination support
    if (limit !== undefined) {
      query += ` LIMIT $${paramIndex}`;
      params.push(limit);
      paramIndex++;
    }

    if (offset !== undefined) {
      query += ` OFFSET $${paramIndex}`;
      params.push(offset);
    }

    const result = await pool.query(query, params);

    // âœ… FIX: Map response Ä‘á»ƒ Ä‘áº£m báº£o format nháº¥t quĂ¡n
    return result.rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      admin_id: row.admin_id,
      message: row.message,
      is_admin: row.is_admin || row.isAdmin || false,
      created_at: row.created_at || row.createdAt,
      createdAt: row.created_at || row.createdAt,
      user_name: row.user_name,
      user_email: row.user_email,
      user_avatar: row.user_avatar,
      admin_name: row.admin_name,
      admin_email: row.admin_email,
    }));
  } catch (error) {
    logger.error('Error getting chats', error, { userId, adminId });
    throw error;
  }
}
export async function createChat(chatData: {
  userId: number;
  adminId: number | null;
  message: string;
  isAdmin: boolean;
}) {
  try {
    const result = await pool.query(
      `INSERT INTO chats (user_id, admin_id, message, is_admin, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id, created_at`,
      [
        chatData.userId,
        chatData.adminId,
        chatData.message,
        chatData.isAdmin,
      ]
    );

    return {
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    };
  } catch (error) {
    logger.error('Error creating chat', error, {
      userId: chatData.userId,
      isAdmin: chatData.isAdmin
    });
    throw error;
  }
}
export async function getUserSubscription(userId: number) {
  try {
    const result = await pool.query(
      `SELECT s.*, sb.*
       FROM subscriptions s
       LEFT JOIN subscription_benefits sb ON s.plan = sb.plan
       WHERE s.user_id = $1 AND s.status = 'active'
       ORDER BY s.start_date DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting user subscription', error, { userId });
    throw error;
  }
}
export async function getSubscriptionDiscount(userId: number): Promise<number> {
  try {
    const sub = await getUserSubscription(userId);
    return sub ? parseFloat(sub.discount_percent || '0') : 0;
  } catch (error) {
    return 0;
  }
}
export async function trackAnalyticsEvent(eventData: {
  userId?: number | null
  eventType: string
  eventData?: Record<string, any> | null
  ipAddress?: string | null
  userAgent?: string | null
}) {
  try {
    const result = await pool.query(
      `INSERT INTO analytics_events (user_id, event_type, event_data, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, CURRENT_TIMESTAMP) RETURNING id`,
      [
        eventData.userId ?? null,
        eventData.eventType,
        eventData.eventData || null,
        eventData.ipAddress ?? null,
        eventData.userAgent ?? null,
      ]
    );
    return { id: result.rows[0].id };
  } catch (error) {
    logger.error("Error tracking analytics event", error, { eventData });
    return null;
  }
}

/**
 * ✅ Mark all messages from a user as read
 */
export async function markMessagesAsRead(userId: number): Promise<boolean> {
  try {
    const query = `
      UPDATE chats 
      SET is_read = true 
      WHERE user_id = $1 AND is_admin = false AND is_read = false
    `;
    await pool.query(query, [userId]);
    return true;
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return false;
  }
}


