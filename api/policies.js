const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('policies')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    if (req.method === 'POST') {
      const { name, description, settings, priority } = req.body;
      if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
      const { data, error } = await supabase
        .from('policies')
        .insert({ name, description: description || '', settings: settings || {}, priority: priority || 0 })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  });
};
