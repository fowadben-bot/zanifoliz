BEGIN;

CREATE TABLE IF NOT EXISTS daily_usage (
  child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  chat_messages INTEGER NOT NULL DEFAULT 0 CHECK (chat_messages >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (child_id, usage_date)
);

CREATE INDEX IF NOT EXISTS daily_usage_date_idx ON daily_usage(usage_date);

ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_usage_access ON daily_usage;
CREATE POLICY daily_usage_access ON daily_usage FOR ALL
  USING (
    child_id = NULLIF(current_setting('app.child_id', true),'')::BIGINT
    OR EXISTS (
      SELECT 1 FROM children c
      WHERE c.id = daily_usage.child_id
        AND c.parent_id = NULLIF(current_setting('app.parent_id', true),'')::BIGINT
    )
  )
  WITH CHECK (
    child_id = NULLIF(current_setting('app.child_id', true),'')::BIGINT
    OR EXISTS (
      SELECT 1 FROM children c
      WHERE c.id = daily_usage.child_id
        AND c.parent_id = NULLIF(current_setting('app.parent_id', true),'')::BIGINT
    )
  );

COMMIT;
