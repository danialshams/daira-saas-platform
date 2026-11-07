BEGIN;
CREATE TABLE IF NOT EXISTS account_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password','change_email')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_tokens_user_idx ON account_tokens(user_id,purpose,created_at DESC);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_authority TEXT UNIQUE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_started_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_ref TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_invoice_idx ON payment_events(invoice_id,created_at DESC);
CREATE TABLE IF NOT EXISTS integration_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_tokens_workspace_idx ON integration_tokens(workspace_id);
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_hash CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id,created_at DESC);
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS webhook_deliveries_workspace_idx ON webhook_deliveries(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_start);
CREATE INDEX IF NOT EXISTS usage_idempotency_created_idx ON usage_idempotency(created_at);
CREATE TABLE IF NOT EXISTS outbound_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 kind TEXT NOT NULL CHECK(kind IN ('email','sms')),
 target TEXT NOT NULL,
 template TEXT NOT NULL,
 payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
 attempts INT NOT NULL DEFAULT 0,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS outbound_messages_status_idx ON outbound_messages(status,created_at);
COMMIT;
