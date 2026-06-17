const supabase = require('../../lib/supabase');
const { verifyToken } = require('../../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    const { id } = req.query;

    if (req.method === 'GET') {
      if (req.query.devices) {
        const { data } = await supabase
          .from('device_policies')
          .select('*, devices(*)')
          .eq('policy_id', id);
        return res.json(data || []);
      }

      const { data, error } = await supabase
        .from('policies')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) return res.status(404).json({ error: 'Política não encontrada' });
      return res.json(data);
    }

    if (req.method === 'PUT') {
      const { name, description, settings, is_active, priority } = req.body;
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (settings !== undefined) updates.settings = settings;
      if (is_active !== undefined) updates.is_active = is_active;
      if (priority !== undefined) updates.priority = priority;

      const { data, error } = await supabase
        .from('policies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    if (req.method === 'DELETE') {
      await supabase.from('policies').delete().eq('id', id);
      return res.json({ message: 'Política removida' });
    }

    if (req.method === 'POST') {
      const { device_ids } = req.body;
      if (!device_ids || !Array.isArray(device_ids)) {
        return res.status(400).json({ error: 'device_ids é obrigatório (array)' });
      }

      const inserts = device_ids.map(did => ({
        policy_id: id,
        device_id: did,
      }));
      const { error } = await supabase.from('device_policies').upsert(inserts, {
        onConflict: 'device_id, policy_id',
        ignoreDuplicates: true,
      });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ message: `${device_ids.length} dispositivo(s) vinculado(s)` });
    }

    res.status(405).json({ error: 'Method not allowed' });
  });
};
