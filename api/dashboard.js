const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    const [
      { count: totalDevices },
      { count: onlineDevices },
      { count: activePolicies },
      { count: pendingCommands },
    ] = await Promise.all([
      supabase.from('devices').select('*', { count: 'exact', head: true }),
      supabase.from('devices').select('*', { count: 'exact', head: true }).eq('status', 'online'),
      supabase.from('policies').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('commands').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const { data: activity } = await supabase
      .from('commands')
      .select('*, devices(hostname)')
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({
      totalDevices: totalDevices || 0,
      onlineDevices: onlineDevices || 0,
      activePolicies: activePolicies || 0,
      pendingCommands: pendingCommands || 0,
      activity: activity || [],
    });
  });
};
