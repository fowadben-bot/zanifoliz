BEGIN;

CREATE TABLE IF NOT EXISTS parents (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  family_code VARCHAR(8) NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS children (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  nickname VARCHAR(24) NOT NULL,
  nickname_key VARCHAR(24) NOT NULL,
  age_group VARCHAR(8) NOT NULL CHECK (age_group IN ('5-7','8-10','11-13','14-17')),
  hero VARCHAR(16) NOT NULL CHECK (hero IN ('Lion','Taupe','Rihno')),
  pin_hash TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
  ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_minutes SMALLINT NOT NULL DEFAULT 30 CHECK (daily_minutes BETWEEN 10 AND 180),
  created_by_child BOOLEAN NOT NULL DEFAULT TRUE,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(parent_id, nickname_key)
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  session_type VARCHAR(8) NOT NULL CHECK (session_type IN ('parent','child')),
  parent_id BIGINT REFERENCES parents(id) ON DELETE CASCADE,
  child_id BIGINT REFERENCES children(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((session_type='parent' AND parent_id IS NOT NULL AND child_id IS NULL)
      OR (session_type='child' AND child_id IS NOT NULL AND parent_id IS NULL))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('verify_email','password_reset')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS progress (
  child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  activity_key VARCHAR(64) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  stars SMALLINT NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (child_id, activity_key)
);

CREATE TABLE IF NOT EXISTS favorites (
  child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  content_type VARCHAR(16) NOT NULL CHECK (content_type IN ('game','clip','story')),
  content_key VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (child_id, content_type, content_key)
);

CREATE TABLE IF NOT EXISTS consents (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id BIGINT REFERENCES children(id) ON DELETE CASCADE,
  kind VARCHAR(64) NOT NULL,
  text_version VARCHAR(32) NOT NULL,
  granted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_lookup_idx ON sessions(token_hash, expires_at);
CREATE INDEX IF NOT EXISTS auth_tokens_lookup_idx ON auth_tokens(token_hash, purpose, expires_at);
CREATE INDEX IF NOT EXISTS children_parent_idx ON children(parent_id, status);
CREATE INDEX IF NOT EXISTS consents_parent_idx ON consents(parent_id, child_id, kind);

ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE children FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS children_read ON children;
DROP POLICY IF EXISTS children_parent_write ON children;
CREATE POLICY children_read ON children FOR SELECT
  USING (
    parent_id = NULLIF(current_setting('app.parent_id', true),'')::BIGINT
    OR id = NULLIF(current_setting('app.child_id', true),'')::BIGINT
  );
CREATE POLICY children_parent_write ON children FOR ALL
  USING (parent_id = NULLIF(current_setting('app.parent_id', true),'')::BIGINT)
  WITH CHECK (parent_id = NULLIF(current_setting('app.parent_id', true),'')::BIGINT);

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS progress_access ON progress;
CREATE POLICY progress_access ON progress FOR ALL
  USING (
    child_id = NULLIF(current_setting('app.child_id', true),'')::BIGINT
    OR EXISTS (
      SELECT 1 FROM children c WHERE c.id=progress.child_id
      AND c.parent_id=NULLIF(current_setting('app.parent_id', true),'')::BIGINT
    )
  )
  WITH CHECK (
    child_id = NULLIF(current_setting('app.child_id', true),'')::BIGINT
    OR EXISTS (
      SELECT 1 FROM children c WHERE c.id=progress.child_id
      AND c.parent_id=NULLIF(current_setting('app.parent_id', true),'')::BIGINT
    )
  );

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS favorites_access ON favorites;
CREATE POLICY favorites_access ON favorites FOR ALL
  USING (
    child_id = NULLIF(current_setting('app.child_id', true),'')::BIGINT
    OR EXISTS (
      SELECT 1 FROM children c WHERE c.id=favorites.child_id
      AND c.parent_id=NULLIF(current_setting('app.parent_id', true),'')::BIGINT
    )
  )
  WITH CHECK (
    child_id = NULLIF(current_setting('app.child_id', true),'')::BIGINT
    OR EXISTS (
      SELECT 1 FROM children c WHERE c.id=favorites.child_id
      AND c.parent_id=NULLIF(current_setting('app.parent_id', true),'')::BIGINT
    )
  );

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consents_parent_access ON consents;
CREATE POLICY consents_parent_access ON consents FOR ALL
  USING (parent_id = NULLIF(current_setting('app.parent_id', true),'')::BIGINT)
  WITH CHECK (parent_id = NULLIF(current_setting('app.parent_id', true),'')::BIGINT);

COMMIT;
