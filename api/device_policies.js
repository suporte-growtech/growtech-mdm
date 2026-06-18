const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    const { device_id } = req.query;

    // GET /api/device_policies?device_id=X - list policies for a device
    if (req.method === 'GET') {
      if (!device_id) return res.status(400).json({ error: 'device_id obrigatório' });
      const { data, error } = await supabase
        .from('device_policies')
        .select('*, policies(*)')
        .eq('device_id', device_id)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // POST /api/device_policies - assign policy to device
    if (req.method === 'POST') {
      const { device_id: did, policy_id } = req.body;
      if (!did || !policy_id) return res.status(400).json({ error: 'device_id e policy_id obrigatórios' });
      const { data, error } = await supabase
        .from('device_policies')
        .insert({ device_id: did, policy_id, status: 'applied' })
        .select('*, policies(*)')
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    // PATCH /api/device_policies - toggle policy status
    if (req.method === 'PATCH') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'id e status obrigatórios' });
      if (!['applied', 'inactive'].includes(status)) return res.status(400).json({ error: 'status deve ser applied ou inactive' });
      const { data, error } = await supabase.from('device_policies').update({ status }).eq('id', id).select('*, policies(*)').single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // DELETE /api/device_policies?id=X - remove policy assignment
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const { error } = await supabase.from('device_policies').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  });
};
