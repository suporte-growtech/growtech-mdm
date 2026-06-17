const supabase = require('../lib/supabase');
const { verifyToken } = require('../lib/auth');

async function resolveLocation(ip) {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost') return null;
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,region,country,lat,lon,query,status`);
    const data = await res.json();
    if (data.status !== 'success') return null;
    return {
      city: data.city,
      region: data.region,
      country: data.country,
      latitude: data.lat,
      longitude: data.lon,
    };
  } catch { return null; }
}

module.exports = async (req, res) => {
  verifyToken(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { data: devices } = await supabase
      .from('devices')
      .select('id, ip_address, city')
      .is('city', null)
      .not('ip_address', 'is', null)
      .limit(50);

    if (!devices || devices.length === 0) return res.json({ resolved: 0, message: 'Todos já possuem localização' });

    let resolved = 0;
    for (const d of devices) {
      const loc = await resolveLocation(d.ip_address);
      if (loc) {
        await supabase.from('devices').update(loc).eq('id', d.id);
        resolved++;
      }
    }

    return res.json({ resolved, total: devices.length });
  });
};
