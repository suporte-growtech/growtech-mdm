const supabase = require('../../lib/supabase');
const { verifyToken } = require('../../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    const { id } = req.query;

    if (req.method === 'GET') {
      if (req.query.software) {
        const { data } = await supabase
          .from('software')
          .select('*')
          .eq('device_id', id)
          .order('name');
        return res.json(data || []);
      }
      if (req.query.history) {
        const { data } = await supabase
          .from('commands')
          .select('*')
          .eq('device_id', id)
          .order('created_at', { ascending: false })
          .limit(50);
        return res.json(data || []);
      }

      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Dispositivo não encontrado' });
      return res.json(data);
    }

    if (req.method === 'PATCH') {
      const { status } = req.body;
      if (status && !['online', 'offline', 'blocked', 'decommissioned'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      const updates = {};
      if (status) updates.status = status;

      const { data, error } = await supabase
        .from('devices')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === 'DELETE') {
      await supabase.from('devices').delete().eq('id', id);
      return res.json({ message: 'Dispositivo removido' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  });
};
