CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  filename TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/webp',
  data_base64 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE rules ADD COLUMN image_asset_id TEXT;
ALTER TABLE rules ADD COLUMN use_bridge INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO automation_settings (key, value, updated_at)
VALUES (
  'redirect_bridge',
  '{"enabled":true,"profilePicData":null,"profilePicAssetId":null,"headline":"Your link is almost ready...","quotation":"Good things come to those who create. ✨","author":"","countdownSeconds":3,"buttonText":"Open Link Now →","blurBackground":true}',
  datetime('now')
);
