const { createClient } = require('@supabase/supabase-js');
const os = require('os');
const { execSync } = require('child_process');
const { getSystemInfo, getSoftwareList } = require('./system');
const { executeCommand } = require('./executor');

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SERIAL_NUMBER = process.env.AGENT_SERIAL_NUMBER ||
  execSync('wmic bios get serialnumber', { encoding: 'utf8' })
    .split('\n')[1]?.trim() || 'unknown';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let deviceId = null;

async function registerDevice() {
  const { data: existing } = await supabase
    .from('devices')
    .select('id')
    .eq('serial_number', SERIAL_NUMBER)
    .maybeSingle();

  if (existing) {
    deviceId = existing.id;
  } else {
    const { data: newDevice } = await supabase
      .from('devices')
      .insert({ hostname: os.hostname(), serial_number: SERIAL_NUMBER, status: 'online', agent_version: AGENT_VERSION })
      .select()
      .single();
    deviceId = newDevice?.id;
  }

  if (!deviceId) {
    console.error('Falha ao registrar dispositivo');
    process.exit(1);
  }

  console.log(`Dispositivo registrado: ${deviceId}`);
  await updateStatus('online');
  await sendSystemInfo();
}

async function updateStatus(status) {
  await supabase
    .from('devices')
    .update({ status, last_seen: new Date().toISOString() })
    .eq('id', deviceId);
}

const AGENT_VERSION = require('../package.json').version;

async function sendSystemInfo() {
  try {
    const info = await getSystemInfo();
    await supabase.from('devices').update({
      ...info,
      agent_version: AGENT_VERSION,
      last_seen: new Date().toISOString(),
      status: 'online',
    }).eq('id', deviceId);

    const software = await getSoftwareList();
    if (software.length > 0) {
      await supabase.from('software').delete().eq('device_id', deviceId);
      await supabase.from('software').insert(
        software.map(s => ({ ...s, device_id: deviceId }))
      );
    }
  } catch (err) {
    console.error('Erro ao enviar info do sistema:', err.message);
  }
}

async function listenForCommands() {
  const channel = supabase
    .channel('commands-channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'commands',
        filter: `device_id=eq.${deviceId}`,
      },
      async (payload) => {
        const command = payload.new;
        console.log(`Comando recebido: ${command.type} (${command.id})`);

        await supabase
          .from('commands')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', command.id);

        // Check device policies before executing
        let policyBlocked = false;
        if (command.type === 'install_app' && command.payload?.name) {
          const { data: dp } = await supabase
            .from('device_policies')
            .select('policies!inner(settings)')
            .eq('device_id', deviceId)
            .eq('status', 'active');
          if (dp && dp.length > 0) {
            for (const row of dp) {
              const s = row.policies?.settings;
              if (s?.allowed_apps && Array.isArray(s.allowed_apps)) {
                const ok = s.allowed_apps.some(a => command.payload.name.toLowerCase().includes(a.toLowerCase()));
                if (!ok) { policyBlocked = true; break; }
              }
            }
          }
        }

        if (policyBlocked) {
          await supabase.from('commands').update({
            status: 'failed',
            result: { error: 'Instalação bloqueada pela política de Apps Permitidos' },
            executed_at: new Date().toISOString(),
          }).eq('id', command.id);
          return;
        }

        try {
          const result = await executeCommand(command);
          await supabase
            .from('commands')
            .update({
              status: result.status,
              result: result.result || {},
              executed_at: new Date().toISOString(),
            })
            .eq('id', command.id);
          console.log(`Comando ${command.id} concluído: ${result.status}`);
        } catch (err) {
          await supabase
            .from('commands')
            .update({ status: 'failed', result: { error: err.message }, executed_at: new Date().toISOString() })
            .eq('id', command.id);
        }
      }
    )
    .subscribe();

  console.log('Escutando comandos via Supabase Realtime...');
}

async function heartbeat() {
  setInterval(async () => {
    await updateStatus('online');
    await sendSystemInfo();
  }, 30000);
}

async function main() {
  console.log('Iniciando agente Growtech MDM...');
  await registerDevice();
  await listenForCommands();
  await heartbeat();

  process.on('SIGINT', async () => {
    await updateStatus('offline');
    process.exit(0);
  });
}

main().catch(console.error);
