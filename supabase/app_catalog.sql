-- App catalog for operators
CREATE TABLE IF NOT EXISTS app_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  url TEXT NOT NULL,
  icon VARCHAR(50) DEFAULT 'package',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_catalog DISABLE ROW LEVEL SECURITY;

INSERT INTO app_catalog (name, description, url, icon) VALUES
  ('Google Chrome', 'Navegador Google Chrome', 'https://dl.google.com/chrome/install/latest/chrome_installer.exe', 'chrome'),
  ('Microsoft Teams', 'Microsoft Teams - Comunicação e colaboração', 'https://go.microsoft.com/fwlink/?linkid=2241107&clcid=0x416&culture=pt-br&country=BR', 'message-circle'),
  ('Microsoft Outlook', 'Microsoft Outlook - Email e calendário', 'https://go.microsoft.com/fwlink/p/?linkid=2225976&clcid=0x416&culture=pt-br&country=BR', 'mail'),
  ('ChatGPT', 'ChatGPT - Assistente de IA', 'https://desktop.githubusercontent.com/releases/1.1.1/ChatGPT.Setup.exe', 'message-square'),
  ('WhatsApp', 'WhatsApp Desktop - Mensagens', 'https://web.whatsapp.com/desktop/windows/release/x64/WhatsAppSetup.exe', 'phone')
ON CONFLICT DO NOTHING;

-- Operator user (password: Ecofg@2026)
INSERT INTO admin_users (username, password_hash, role)
VALUES ('operator', crypt('Ecofg@2026', gen_salt('bf')), 'operator')
ON CONFLICT (username) DO UPDATE SET role = 'operator';
