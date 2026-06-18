const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

const COMMAND_TYPES = [
  'install_app', 'uninstall_app', 'run_script', 'shutdown',
  'restart', 'lock', 'set_wallpaper', 'block_usb',
  'update_policy', 'system_info', 'format'
];

const OPERATOR_ALLOWED = ['install_app'];

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    if (req.method === 'GET') {
      const { device_id, status } = req.query;
      let query = supabase.from('commands').select('*').order('created_at', { ascending: false }).limit(100);
      if (device_id) query = query.eq('device_id', device_id);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    if (req.method === 'POST') {
      const { device_id, type, payload } = req.body;

      if (!device_id || !type) {
        return res.status(400).json({ error: 'device_id e type são obrigatórios' });
      }
      if (!COMMAND_TYPES.includes(type)) {
        return res.status(400).json({ error: `Tipo inválido. Tipos: ${COMMAND_TYPES.join(', ')}` });
      }

      // Operator restrictions
      if (req.user.role === 'operator') {
        if (!OPERATOR_ALLOWED.includes(type)) {
          return res.status(403).json({ error: 'Operador só pode instalar aplicativos do catálogo' });
        }
        if (payload?.name) {
          const { data: catalog } = await supabase
            .from('app_catalog')
            .select('name')
            .ilike('name', payload.name);
          if (!catalog || catalog.length === 0) {
            return res.status(403).json({ error: `App "${payload.name}" não está no catálogo aprovado` });
          }
        }
        if (payload?.path || payload?.url) {
          return res.status(403).json({ error: 'Operador não pode usar caminho personalizado' });
        }
      }

      const { data, error } = await supabase
        .from('commands')
        .insert({
          device_id,
          type,
          payload: payload || {},
          created_by: req.user?.username || 'system',
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  });
};
