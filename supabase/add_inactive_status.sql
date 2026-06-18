ALTER TABLE device_policies DROP CONSTRAINT IF EXISTS device_policies_status_check;
ALTER TABLE device_policies ADD CONSTRAINT device_policies_status_check CHECK (status IN ('pending', 'applied', 'failed', 'inactive'));
UPDATE device_policies SET status = 'applied' WHERE status IS NULL OR status = '';
