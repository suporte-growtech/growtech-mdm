CREATE TABLE IF NOT EXISTS backup_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE UNIQUE,
  destination_path TEXT NOT NULL,
  destination_type VARCHAR(20) DEFAULT 'network' CHECK (destination_type IN ('network', 'local')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE backup_config DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_backup_config_device ON backup_config(device_id);
