-- Add agent_version column
ALTER TABLE devices ADD COLUMN IF NOT EXISTS agent_version VARCHAR(20) DEFAULT '0.0.0';
