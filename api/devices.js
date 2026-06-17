const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    if (req.method === 'GET') {
      let query = supabase.from('devices').select('*').order('updated_at', { ascending: false });

      if (req.query.status) {
        query = query.eq('status', req.query.status);
      }
      if (req.query.search) {
        query = query.or(
          `hostname.ilike.%${req.query.search}%,serial_number.ilike.%${req.query.search}%`
        );
      }

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'ID é obrigatório' });
      const { data, error } = await supabase.from('devices').update(updates).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  });
};
