CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  size_bytes BIGINT DEFAULT 0,
  folders TEXT,
  storage_url TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE backups DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_backups_device ON backups(device_id);
