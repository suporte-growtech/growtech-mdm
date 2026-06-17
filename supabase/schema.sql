-- Habilitar extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Habilitar Realtime para a tabela commands (agentes escutam mudanças)
ALTER PUBLICATION supabase_realtime ADD TABLE commands;

-- Tabela de dispositivos
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hostname VARCHAR(255) NOT NULL,
  serial_number VARCHAR(255) UNIQUE,
  os VARCHAR(100),
  os_version VARCHAR(100),
  cpu_model VARCHAR(255),
  ram_total BIGINT,
  disk_total BIGINT,
  ip_address VARCHAR(45),
  mac_address VARCHAR(17),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'blocked', 'decommissioned')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de políticas
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de vinculação device-política
CREATE TABLE IF NOT EXISTS device_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'failed')),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, policy_id)
);

-- Tabela de comandos (com Realtime habilitado)
CREATE TABLE IF NOT EXISTS commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  payload JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'executed', 'failed', 'cancelled')),
  result JSONB,
  sent_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de software instalado
CREATE TABLE IF NOT EXISTS software (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(100),
  publisher VARCHAR(255),
  install_date DATE,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de usuários admin
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'viewer', 'operator')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir admin padrão (senha: admin123)
INSERT INTO admin_users (username, password_hash)
VALUES ('admin', crypt('admin123', gen_salt('bf')))
ON CONFLICT (username) DO NOTHING;

-- Índices
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
CREATE INDEX IF NOT EXISTS idx_device_policies_status ON device_policies(status);

-- Função de autenticação
CREATE OR REPLACE FUNCTION authenticate_user(p_username TEXT, p_password TEXT)
RETURNS TABLE (id UUID, username VARCHAR, role VARCHAR) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.role
  FROM admin_users u
  WHERE u.username = p_username AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: desabilitado para simplificar (internal tool)
ALTER TABLE devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE policies DISABLE ROW LEVEL SECURITY;
ALTER TABLE device_policies DISABLE ROW LEVEL SECURITY;
ALTER TABLE commands DISABLE ROW LEVEL SECURITY;
ALTER TABLE software DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;
