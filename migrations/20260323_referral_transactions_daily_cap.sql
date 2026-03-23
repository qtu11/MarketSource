-- Referral daily commission cap support (referral_transactions)
-- Run this SQL before deploying the daily-cap code in lib/db/transactions.ts

CREATE TABLE IF NOT EXISTS public.referral_transactions (
  id BIGSERIAL PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referral_id INTEGER REFERENCES public.referrals(id) ON DELETE SET NULL,
  purchase_amount NUMERIC(15,2) NOT NULL,
  commission_amount NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_transactions_referrer_created_at
  ON public.referral_transactions (referrer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_transactions_created_at
  ON public.referral_transactions (created_at DESC);

