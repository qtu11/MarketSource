-- Bổ sung cột cho DB đã có audit_logs kiểu cũ (thiếu target_type / details).
-- Chạy một lần: psql $DATABASE_URL -f migrations/20260322_audit_logs_target_columns.sql

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_id VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
