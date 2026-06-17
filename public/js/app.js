const API = '/api';
let token = localStorage.getItem('mdm_token');
let devicesCache = [];
let policiesCache = [];
let currentDeviceId = null;
let statusChart = null;

function $(id) { return document.getElementById(id); }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) { logout(); throw new Error('Não autorizado'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${id}"]`)?.classList.add('active');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('pt-BR');
}

/* Login */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginError').textContent = '';
  try {
    const res = await api('/auth', {
      method: 'POST',
      body: JSON.stringify({ username: $('username').value, password: $('password').value })
    });
    token = res.token;
    localStorage.setItem('mdm_token', token);
    $('loginPage').classList.add('hidden');
    $('app').classList.remove('hidden');
    initApp();
  } catch (err) {
    $('loginError').textContent = err.message;
  }
});

function logout() {
  token = null;
  localStorage.removeItem('mdm_token');
  $('app').classList.add('hidden');
  $('loginPage').classList.remove('hidden');
}
$('logoutBtn').addEventListener('click', logout);

/* Navigation */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => showPage(item.dataset.page));
});

/* App Init */
function initApp() {
  loadDashboard();
  loadDevices();
  loadPolicies();
  setInterval(loadDashboard, 15000);
}

/* Dashboard */
async function loadDashboard() {
  try {
    const data = await api('/dashboard');
    $('totalDevices').textContent = data.totalDevices;
    $('onlineDevices').textContent = data.onlineDevices;
    $('activePolicies').textContent = data.activePolicies;
    $('pendingCommands').textContent = data.pendingCommands;

    const ctx = $('statusChart');
    if (ctx && !statusChart) {
      statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Online', 'Offline', 'Bloqueado'],
          datasets: [{
            data: [data.onlineDevices, data.totalDevices - data.onlineDevices, 0],
            backgroundColor: ['#0f9d58', '#9aa0a6', '#ea4335'],
            borderWidth: 0,
          }]
        },
        options: { cutout: '70%', plugins: { legend: { position: 'bottom' } } }
      });
    }

    const activity = data.activity || [];
    $('activityList').innerHTML = activity.slice(0, 10).map(c =>
      `<li>
        <span><strong>${c.devices?.hostname || 'N/A'}</strong> — ${c.type}</span>
        <span class="badge badge-${c.status}">${c.status}</span>
      </li>`
    ).join('');
  } catch {}
}

/* Devices */
async function loadDevices() {
  try {
    devicesCache = await api('/devices');
    renderDevices(devicesCache);
  } catch {}
}

function renderDevices(devices) {
  $('deviceList').innerHTML = devices.map(d => `
    <tr onclick="showDeviceDetail('${d.id}')" style="cursor:pointer">
      <td><strong>${d.hostname}</strong></td>
      <td>${d.serial_number || '-'}</td>
      <td>${d.os || '-'}</td>
      <td>${formatBytes(d.ram_total)}</td>
      <td>${formatBytes(d.disk_total)}</td>
      <td><span class="badge badge-${d.status}">${d.status}</span></td>
      <td>${formatDate(d.last_seen)}</td>
    </tr>
  `).join('');
}

$('deviceSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderDevices(devicesCache.filter(d =>
    d.hostname.toLowerCase().includes(q) ||
    (d.serial_number || '').toLowerCase().includes(q)
  ));
});

$('refreshDevices').addEventListener('click', loadDevices);

async function showDeviceDetail(id) {
  showPage('deviceDetail');
  const device = devicesCache.find(d => d.id === id);
  if (!device) return;
  currentDeviceId = id;

  $('detailHostname').textContent = device.hostname;
  $('detailHostname2').textContent = device.hostname;
  $('detailSerial').textContent = device.serial_number || '-';
  $('detailOs').textContent = `${device.os || ''} ${device.os_version || ''}`;
  $('detailCpu').textContent = device.cpu_model || '-';
  $('detailRam').textContent = formatBytes(device.ram_total);
  $('detailDisk').textContent = formatBytes(device.disk_total);
  $('detailIp').textContent = device.ip_address || '-';
  $('detailMac').textContent = device.mac_address || '-';
  $('detailStatus').innerHTML = `<span class="badge badge-${device.status}">${device.status}</span>`;
  $('detailLastSeen').textContent = formatDate(device.last_seen);
  $('detailEnrolled').textContent = formatDate(device.enrolled_at);
  $('detailId').textContent = device.id;

  try {
    const commands = await api(`/devices/${id}?history=true`);
    $('detailCommands').innerHTML = (commands || []).map(c =>
      `<li>
        <span>${c.type}</span>
        <span><span class="badge badge-${c.status}">${c.status}</span> ${formatDate(c.created_at)}</span>
      </li>`
    ).join('');
  } catch {}
}

/* Device quick actions */
$('cmdInstall').addEventListener('click', () => {
  if (!currentDeviceId) return;
  showCommandModal('install_app');
});
$('cmdUninstall').addEventListener('click', () => {
  if (!currentDeviceId) return;
  showCommandModal('uninstall_app');
});
$('cmdScript').addEventListener('click', () => {
  if (!currentDeviceId) return;
  showCommandModal('run_script');
});
$('cmdLock').addEventListener('click', async () => {
  if (!currentDeviceId || !confirm('Bloquear este dispositivo?')) return;
  await api('/commands', { method: 'POST', body: JSON.stringify({ device_id: currentDeviceId, type: 'lock', payload: {} }) });
  alert('Comando enviado!');
});
$('cmdRestart').addEventListener('click', async () => {
  if (!currentDeviceId || !confirm('Reiniciar este dispositivo?')) return;
  await api('/commands', { method: 'POST', body: JSON.stringify({ device_id: currentDeviceId, type: 'restart', payload: { delay: 10 } }) });
  alert('Comando de reinicialização enviado!');
});
$('cmdShutdown').addEventListener('click', async () => {
  if (!currentDeviceId || !confirm('Desligar este dispositivo?')) return;
  await api('/commands', { method: 'POST', body: JSON.stringify({ device_id: currentDeviceId, type: 'shutdown', payload: { delay: 10 } }) });
  alert('Comando de desligamento enviado!');
});

/* Policies */
async function loadPolicies() {
  try {
    policiesCache = await api('/policies');
    renderPolicies(policiesCache);
  } catch {}
}

function renderPolicies(policies) {
  $('policyList').innerHTML = policies.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.description || '-'}</td>
      <td><code style="font-size:11px">${Object.keys(p.settings || {}).length} config(s)</code></td>
      <td>${p.priority}</td>
      <td><span class="badge ${p.is_active ? 'badge-online' : 'badge-offline'}">${p.is_active ? 'Ativa' : 'Inativa'}</span></td>
      <td>
        <button class="btn btn-sm" onclick="editPolicy('${p.id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deletePolicy('${p.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

$('newPolicyBtn').addEventListener('click', () => showPolicyModal(null));
function showPolicyModal(policy) {
  $('modalOverlay').classList.remove('hidden');
  $('modalTitle').textContent = policy ? 'Editar Política' : 'Nova Política';
  $('policyName').value = policy?.name || '';
  $('policyDesc').value = policy?.description || '';
  $('policyPriority').value = policy?.priority || 0;
  $('policySettings').value = policy?.settings ? JSON.stringify(policy.settings, null, 2) : '{}';
  $('policyId').value = policy?.id || '';
}

$('cancelPolicy').addEventListener('click', () => $('modalOverlay').classList.add('hidden'));
$('savePolicy').addEventListener('click', async () => {
  const data = {
    name: $('policyName').value,
    description: $('policyDesc').value,
    priority: parseInt($('policyPriority').value) || 0,
    settings: JSON.parse($('policySettings').value || '{}'),
  };
  const pid = $('policyId').value;
  try {
    if (pid) {
      await api(`/policies/${pid}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/policies', { method: 'POST', body: JSON.stringify(data) });
    }
    $('modalOverlay').classList.add('hidden');
    loadPolicies();
  } catch (err) { alert(err.message); }
});

async function editPolicy(id) {
  const policy = policiesCache.find(p => p.id === id);
  if (policy) showPolicyModal(policy);
}

async function deletePolicy(id) {
  if (!confirm('Remover esta política?')) return;
  await api(`/policies/${id}`, { method: 'DELETE' });
  loadPolicies();
}

/* Command modal */
function showCommandModal(type) {
  $('cmdModal').classList.remove('hidden');
  $('cmdModalTitle').textContent = type === 'install_app' ? 'Instalar Aplicativo' :
    type === 'uninstall_app' ? 'Remover Aplicativo' : 'Executar Script';
  $('cmdType').value = type;
  $('cmdLabel1').textContent = type === 'run_script' ? 'Script (PowerShell):' : 'Nome do App:';
  $('cmdField2').classList.toggle('hidden', type !== 'install_app');
  $('cmdField1').querySelector('input,textarea').value = '';
  $('cmdPath').value = '';
}
$('cancelCmd').addEventListener('click', () => $('cmdModal').classList.add('hidden'));
$('sendCmd').addEventListener('click', async () => {
  const type = $('cmdType').value;
  const val1 = document.querySelector('#cmdField1 textarea, #cmdField1 input').value;
  const path = $('cmdPath').value;
  let payload = {};
  if (type === 'install_app') { payload.name = val1; if (path) payload.path = path; }
  else if (type === 'uninstall_app') payload.name = val1;
  else if (type === 'run_script') payload.script = val1;
  try {
    await api('/commands', {
      method: 'POST',
      body: JSON.stringify({ device_id: currentDeviceId, type, payload })
    });
    $('cmdModal').classList.add('hidden');
    alert('Comando enviado!');
  } catch (err) { alert(err.message); }
});

/* Broadcast */
$('broadcastBtn').addEventListener('click', () => $('broadcastModal').classList.remove('hidden'));
$('cancelBroadcast').addEventListener('click', () => $('broadcastModal').classList.add('hidden'));
$('sendBroadcast').addEventListener('click', async () => {
  const type = $('broadcastType').value;
  const payload = {};
  if (type === 'install_app') payload.name = $('broadcastApp').value;
  else if (type === 'run_script') payload.script = $('broadcastScript').value;
  else if (type === 'set_wallpaper') payload.image_path = $('broadcastWallpaper').value;
  try {
    const res = await api('/broadcast', { method: 'POST', body: JSON.stringify({ type, payload }) });
    $('broadcastModal').classList.add('hidden');
    alert(`Comando enviado para ${res.sent} dispositivo(s)!`);
  } catch (err) { alert(err.message); }
});

$('broadcastType').addEventListener('change', () => {
  ['broadcastAppField', 'broadcastScriptField', 'broadcastWallpaperField'].forEach(id => $(id).classList.add('hidden'));
  const t = $('broadcastType').value;
  if (t === 'install_app') $('broadcastAppField').classList.remove('hidden');
  else if (t === 'run_script') $('broadcastScriptField').classList.remove('hidden');
  else if (t === 'set_wallpaper') $('broadcastWallpaperField').classList.remove('hidden');
});

/* Init */
if (token) {
  $('loginPage').classList.add('hidden');
  $('app').classList.remove('hidden');
  initApp();
}
