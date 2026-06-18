const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    if (req.method === 'GET') {
      const { device_id } = req.query;
      let query = supabase.from('backups').select('*').order('created_at', { ascending: false });
      if (device_id) query = query.eq('device_id', device_id);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }
    res.status(405).json({ error: 'Method not allowed' });
  });
};
