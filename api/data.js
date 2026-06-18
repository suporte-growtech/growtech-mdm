const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    const path = req.url.split('?')[0].replace(/^\/api\/data/, '');

    // Backups
    if (path === '/backups' && req.method === 'GET') {
      const { device_id } = req.query;
      let query = supabase
        .from('backups')
        .select('*, devices!inner(hostname)')
        .order('created_at', { ascending: false });
      if (device_id) query = query.eq('device_id', device_id);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // Backup config - get
    if (path === '/backup-config' && req.method === 'GET') {
      const { device_id } = req.query;
      if (!device_id) return res.status(400).json({ error: 'device_id obrigatório' });
      const { data, error } = await supabase
        .from('backup_config')
        .select('*')
        .eq('device_id', device_id)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || {});
    }

    // Backup config - save
    if (path === '/backup-config' && req.method === 'PUT') {
      const { device_id, destination_path, destination_type } = req.body;
      if (!device_id || !destination_path) return res.status(400).json({ error: 'device_id e destination_path obrigatórios' });
      const { data, error } = await supabase
        .from('backup_config')
        .upsert({ device_id, destination_path, destination_type: destination_type || 'network' })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // Apps catalog
    if (path === '/apps' && req.method === 'GET') {
      const { data, error } = await supabase.from('app_catalog').select('*').order('name');
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }
    if (path === '/apps' && req.method === 'POST') {
      const { name, description, url, icon } = req.body;
      if (!name || !url) return res.status(400).json({ error: 'name e url obrigatórios' });
      const { data, error } = await supabase.from('app_catalog').insert({ name, description, url, icon }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }
    if (path === '/apps' && req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const { error } = await supabase.from('app_catalog').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    // Device policies
    if (path === '/device_policies' && req.method === 'GET') {
      const { device_id } = req.query;
      if (!device_id) return res.status(400).json({ error: 'device_id obrigatório' });
      const { data, error } = await supabase
        .from('device_policies')
        .select('*, policies(*)')
        .eq('device_id', device_id)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }
    if (path === '/device_policies' && req.method === 'POST') {
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
    if (path === '/device_policies' && req.method === 'PATCH') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'id e status obrigatórios' });
      if (!['applied', 'inactive'].includes(status)) return res.status(400).json({ error: 'status deve ser applied ou inactive' });
      const { data, error } = await supabase.from('device_policies').update({ status }).eq('id', id).select('*, policies(*)').single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    if (path === '/device_policies' && req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const { error } = await supabase.from('device_policies').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    res.status(404).json({ error: 'Not found' });
  });
};
