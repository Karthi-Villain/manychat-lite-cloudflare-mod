ALTER TABLE rules ADD COLUMN post_id TEXT;
ALTER TABLE rules ADD COLUMN post_url TEXT;
ALTER TABLE rules ADD COLUMN match_type TEXT NOT NULL DEFAULT 'contains';

CREATE INDEX IF NOT EXISTS idx_rules_post_id ON rules (post_id);
