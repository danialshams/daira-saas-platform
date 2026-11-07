BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL;
CREATE TABLE IF NOT EXISTS phone_challenges (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 phone TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify_phone','login')),
 code_hash CHAR(64) NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 attempts INT NOT NULL DEFAULT 0,
 consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_challenges_user_idx ON phone_challenges(user_id,purpose,created_at DESC);
COMMIT;
