const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

const COMMAND_TYPES = [
  'install_app', 'uninstall_app', 'run_script', 'shutdown',
  'restart', 'lock', 'set_wallpaper', 'block_usb',
  'update_policy', 'system_info', 'format'
];

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { type, payload, device_ids } = req.body;
    if (!type) return res.status(400).json({ error: 'type é obrigatório' });
    if (!COMMAND_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Tipos: ${COMMAND_TYPES.join(', ')}` });
    }

    let devices;
    if (device_ids && Array.isArray(device_ids)) {
      devices = device_ids;
    } else {
      const { data } = await supabase
        .from('devices')
        .select('id')
        .eq('status', 'online');
      devices = (data || []).map(d => d.id);
    }

    const inserts = devices.map(did => ({
      device_id: did,
      type,
      payload: payload || {},
      created_by: req.user?.username || 'system',
    }));

    const { data, error } = await supabase
      .from('commands')
      .insert(inserts)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({
      sent: (data || []).length,
      total: devices.length,
      commands: data || [],
    });
  });
};
