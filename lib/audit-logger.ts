import { pool } from './database';
import { logger } from './logger';

export interface AuditLogData {
  adminId: number;
  adminEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string | number;
  details?: any;
  ipAddress?: string;
}

/** Lấy id admin trong DB từ session/token (email hoặc uid số) */
export async function resolveAdminIdForAudit(admin: {
  email?: string | null;
  uid?: string | number | null;
}): Promise<number> {
  try {
    if (admin.email) {
      const { getUserIdByEmail } = await import('./database');
      const id = await getUserIdByEmail(admin.email);
      if (id) return id;
    }
    const u = admin.uid;
    if (u != null && /^\d+$/.test(String(u))) return parseInt(String(u), 10);
  } catch {
    /* ignore */
  }
  return 0;
}

/**
 * Log an admin action to the database.
 * Thử lần lượt: schema migration (target_type, details) → schema Supabase (entity_type, new_values) → INSERT tối giản.
 */
export async function logAdminAction(data: AuditLogData) {
  const actionStr = `${data.action}${data.adminEmail ? ` (${data.adminEmail})` : ''}`;
  const adminId = data.adminId > 0 ? data.adminId : null;

  const tryModern = () =>
    pool.query(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        adminId,
        actionStr,
        data.targetType || null,
        data.targetId != null ? String(data.targetId) : null,
        data.details ? JSON.stringify(data.details) : null,
        data.ipAddress || null,
      ]
    );

  const trySupabaseShape = () => {
    const tid = data.targetId;
    let entityId: number | null = null;
    if (tid != null && tid !== '') {
      const n = parseInt(String(tid), 10);
      if (Number.isFinite(n)) entityId = n;
    }
    const newValues = {
      ...(data.details && typeof data.details === 'object' ? data.details : {}),
      ...(tid != null && entityId === null ? { targetId: String(tid) } : {}),
      ...(data.adminEmail ? { adminEmail: data.adminEmail } : {}),
    };
    return pool.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        adminId,
        actionStr,
        data.targetType || null,
        entityId,
        JSON.stringify(newValues),
        data.ipAddress || null,
      ]
    );
  };

  const tryMinimal = () =>
    pool.query(
      `INSERT INTO audit_logs (admin_id, action, ip_address)
       VALUES ($1, $2, $3)`,
      [adminId, actionStr, data.ipAddress || null]
    );

  const attempts = [
    { name: 'modern', run: tryModern },
    { name: 'supabase_entity', run: trySupabaseShape },
    { name: 'minimal', run: tryMinimal },
  ];

  let lastError: unknown;
  for (const { name, run } of attempts) {
    try {
      await run();
      return;
    } catch (err: unknown) {
      lastError = err;
      logger.debug('audit_logs insert attempt failed, trying next shape', {
        attempt: name,
        code: (err as { code?: string })?.code,
        message: (err as Error)?.message,
      });
    }
  }

  logger.error('Failed to log admin action (all insert shapes failed)', lastError, { data });
}
