const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('app_catalog').select('*').order('name');
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    if (req.method === 'POST') {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode gerenciar o catálogo' });
      const { name, description, url, icon } = req.body;
      if (!name || !url) return res.status(400).json({ error: 'name e url obrigatórios' });
      const { data, error } = await supabase.from('app_catalog').insert({ name, description, url, icon }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode gerenciar o catálogo' });
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const { error } = await supabase.from('app_catalog').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  });
};
