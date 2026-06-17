const si = require('systeminformation');
const os = require('os');

async function getSystemInfo() {
  const [cpu, mem, disk, network] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.fsSize(),
    si.networkInterfaces(),
  ]);

  const net = network.find(n => !n.internal) || network[0] || {};

  return {
    hostname: os.hostname(),
    uptime: Math.floor(os.uptime()),
    os: os.type(),
    os_version: os.release(),
    cpu_model: cpu.manufacturer + ' ' + cpu.brand,
    ram_total: mem.total,
    disk_total: disk.length > 0 ? disk[0].size : 0,
    ip_address: net.ip4 || null,
    mac_address: net.mac || null,
  };
}

async function getSoftwareList() {
  try {
    const packages = await si.software();
    return (packages || []).map(pkg => ({
      name: pkg.name,
      version: pkg.version,
      publisher: pkg.publisher || '',
      install_date: pkg.installDate || null,
      is_system: false,
    }));
  } catch {
    return [];
  }
}

module.exports = { getSystemInfo, getSoftwareList };
