const API = '/api';
let token = localStorage.getItem('mdm_token');
let devicesCache = [];
let policiesCache = [];
let currentDeviceId = null;
let statusChart = null;

const $ = id => document.getElementById(id);
const icon = (path, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

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
  const nav = document.querySelector(`[data-page="${id}"]`);
  if (nav) nav.classList.add('active');
  $('pageTitle').textContent = nav ? nav.querySelector('span:last-child').textContent : '';
}

function formatUptime(s) {
  if (!s || s <= 0) return '-';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let s = bytes;
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
  return `${s.toFixed(1)} ${u[i]}`;
}

function formatDate(d) { return d ? new Date(d).toLocaleString('pt-BR') : '-'; }

/* Login */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('loginError');
  err.classList.add('hidden');
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
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
  }
});

function logout() {
  token = null; localStorage.removeItem('mdm_token');
  $('app').classList.add('hidden');
  $('loginPage').classList.remove('hidden');
}
$('logoutBtn').addEventListener('click', logout);

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => showPage(item.dataset.page));
});

function initApp() { loadDashboard(); loadDevices(); loadPolicies(); setInterval(loadDashboard, 15000); }

/* Dashboard */
async function loadDashboard() {
  try {
    const data = await api('/dashboard');
    $('totalDevices').textContent = data.totalDevices;
    $('onlineDevices').textContent = data.onlineDevices;
    $('activePolicies').textContent = data.activePolicies;
    $('pendingCommands').textContent = data.pendingCommands;

    const pct = data.totalDevices > 0 ? Math.round(data.onlineDevices / data.totalDevices * 100) : 0;
    $('onlinePercent').textContent = `${pct}% online`;

    if ($('statusChart') && !statusChart) {
      statusChart = new Chart($('statusChart'), {
        type: 'doughnut',
        data: {
          labels: ['Online', 'Offline'],
          datasets: [{
            data: [data.onlineDevices, Math.max(0, data.totalDevices - data.onlineDevices)],
            backgroundColor: ['#22c55e', '#2a2d44'],
            borderWidth: 0,
          }]
        },
        options: {
          cutout: '78%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#9498b0', padding: 16, font: { family: 'Inter', size: 12 } } }
          }
        }
      });
    }

    const act = data.activity || [];
    $('activityList').innerHTML = act.length
      ? act.slice(0, 8).map(c =>
          `<li>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="activity-dot ${c.status === 'executed' ? 'success' : c.status === 'failed' ? 'danger' : 'info'}"></span>
              <span><strong>${c.devices?.hostname || 'N/A'}</strong> — ${c.type.replace(/_/g, ' ')}</span>
            </div>
            <span class="badge badge-${c.status}">${c.status}</span>
          </li>`
        ).join('')
      : '<li style="color:var(--text-muted);justify-content:center;padding:24px">Nenhuma atividade recente</li>';
  } catch {}
}

/* Devices */
async function loadDevices() {
  try {
    devicesCache = await api('/devices');
    renderDevices(devicesCache);
  } catch {}
}

function renderDevices(list) {
  $('deviceList').innerHTML = list.length
    ? list.map(d =>
        `<tr onclick="showDeviceDetail('${d.id}')" style="cursor:pointer">
          <td><strong>${d.hostname}</strong></td>
          <td style="color:var(--text-secondary)">${d.serial_number || '-'}</td>
          <td>${d.os || '-'}</td>
          <td>${formatBytes(d.ram_total)}</td>
          <td>${formatBytes(d.disk_total)}</td>
          <td><span class="badge badge-${d.status}">${d.status === 'online' ? '●' : '○'} ${d.status}</span></td>
          <td style="color:var(--text-secondary);font-size:12px">${formatUptime(d.uptime)}</td>
          <td style="color:var(--text-muted);font-size:11px">${formatDate(d.last_seen)}</td>
        </tr>`
      ).join('')
    : '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div><p>Nenhum dispositivo conectado</p></div></td></tr>';
}

$('deviceSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderDevices(devicesCache.filter(d =>
    d.hostname.toLowerCase().includes(q) ||
    (d.serial_number || '').toLowerCase().includes(q)
  ));
});
$('refreshDevices').addEventListener('click', loadDevices);

async function showDeviceDetail(id) {
  showPage('deviceDetail');
  const d = devicesCache.find(x => x.id === id);
  if (!d) return;
  currentDeviceId = id;
  const setVal = (el, v) => { if ($(el)) $(el).textContent = v || '-'; };
  setVal('detailHostname', d.hostname); setVal('detailHostname2', d.hostname);
  setVal('detailSerial', d.serial_number);
  setVal('detailOs', `${d.os || ''} ${d.os_version || ''}`);
  setVal('detailCpu', d.cpu_model); setVal('detailRam', formatBytes(d.ram_total));
  setVal('detailDisk', formatBytes(d.disk_total)); setVal('detailIp', d.ip_address);
  setVal('detailMac', d.mac_address);
  setVal('detailUptime', formatUptime(d.uptime));
  setVal('detailLastSeen', formatDate(d.last_seen));
  setVal('detailEnrolled', formatDate(d.enrolled_at)); setVal('detailId', d.id);
  if ($('detailStatus')) $('detailStatus').innerHTML = `<span class="badge badge-${d.status}">● ${d.status}</span>`;

  try {
    const cmds = await api(`/devices/${id}?history=true`);
    $('detailCommands').innerHTML = cmds && cmds.length
      ? cmds.map(c =>
          `<li>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="activity-dot ${c.status === 'executed' ? 'success' : c.status === 'failed' ? 'danger' : 'info'}"></span>
              <span>${c.type.replace(/_/g, ' ')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-${c.status}">${c.status}</span>
              <span style="color:var(--text-muted);font-size:11px">${formatDate(c.created_at)}</span>
            </div>
          </li>`
        ).join('')
      : '<li style="color:var(--text-muted);justify-content:center;padding:24px">Nenhum comando executado ainda</li>';
  } catch {}
}

/* Device actions */
$('cmdInstall').addEventListener('click', () => currentDeviceId && showCmdModal('install_app'));
$('cmdUninstall').addEventListener('click', () => currentDeviceId && showCmdModal('uninstall_app'));
$('cmdScript').addEventListener('click', () => currentDeviceId && showCmdModal('run_script'));
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

function renderPolicies(list) {
  $('policyList').innerHTML = list.length
    ? list.map(p =>
        `<tr>
          <td><strong>${p.name}</strong></td>
          <td style="color:var(--text-secondary)">${p.description || '-'}</td>
          <td><span style="background:var(--bg-input);padding:2px 8px;border-radius:4px;font-size:11px;font-family:monospace">${Object.keys(p.settings || {}).length} props</span></td>
          <td>${p.priority}</td>
          <td><span class="badge ${p.is_active ? 'badge-active' : 'badge-inactive'}">${p.is_active ? 'Ativa' : 'Inativa'}</span></td>
          <td>
            <button class="btn-icon" onclick="editPolicy('${p.id}')" title="Editar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon" onclick="deletePolicy('${p.id}')" title="Excluir" style="color:var(--danger)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>`
      ).join('')
    : '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><p>Nenhuma política criada</p></div></td></tr>';
}

$('newPolicyBtn').addEventListener('click', () => showPolicyModal(null));

function showPolicyModal(p) {
  $('modalOverlay').classList.remove('hidden');
  $('modalTitle').innerHTML = p ? `${icon('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>')} Editar Política` : `${icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>')} Nova Política`;
  $('policyName').value = p?.name || '';
  $('policyDesc').value = p?.description || '';
  $('policyPriority').value = p?.priority || 0;
  $('policySettings').value = p?.settings ? JSON.stringify(p.settings, null, 2) : '{}';
  $('policyId').value = p?.id || '';
}

$('cancelPolicy').addEventListener('click', () => $('modalOverlay').classList.add('hidden'));
$('savePolicy').addEventListener('click', async () => {
  try {
    const data = { name: $('policyName').value, description: $('policyDesc').value, priority: parseInt($('policyPriority').value) || 0, settings: JSON.parse($('policySettings').value || '{}') };
    if ($('policyId').value) await api(`/policies/${$('policyId').value}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/policies', { method: 'POST', body: JSON.stringify(data) });
    $('modalOverlay').classList.add('hidden');
    loadPolicies();
  } catch (e) { alert(e.message); }
});

async function editPolicy(id) { const p = policiesCache.find(x => x.id === id); if (p) showPolicyModal(p); }
async function deletePolicy(id) { if (!confirm('Remover esta política?')) return; await api(`/policies/${id}`, { method: 'DELETE' }); loadPolicies(); }

/* Command modal */
function showCmdModal(type) {
  $('cmdModal').classList.remove('hidden');
  $('cmdModalTitle').textContent = type === 'install_app' ? 'Instalar Aplicativo' : type === 'uninstall_app' ? 'Remover Aplicativo' : 'Executar Script';
  $('cmdType').value = type;
  $('cmdLabel1').textContent = type === 'run_script' ? 'Script (PowerShell):' : 'Nome do App:';
  $('cmdField2').classList.toggle('hidden', type !== 'install_app');
  $('cmdField1').querySelector('textarea').value = '';
  $('cmdPath').value = '';
}
$('cancelCmd').addEventListener('click', () => $('cmdModal').classList.add('hidden'));
$('sendCmd').addEventListener('click', async () => {
  const type = $('cmdType').value;
  const val = document.querySelector('#cmdField1 textarea').value;
  const path = $('cmdPath').value;
  const payload = {};
  if (type === 'install_app') { payload.name = val; if (path) payload.path = path; }
  else if (type === 'uninstall_app') payload.name = val;
  else if (type === 'run_script') payload.script = val;
  try {
    await api('/commands', { method: 'POST', body: JSON.stringify({ device_id: currentDeviceId, type, payload }) });
    $('cmdModal').classList.add('hidden');
    alert('Comando enviado!');
  } catch (e) { alert(e.message); }
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
  } catch (e) { alert(e.message); }
});
$('broadcastType').addEventListener('change', () => {
  ['broadcastAppField', 'broadcastScriptField', 'broadcastWallpaperField'].forEach(id => $(id).classList.add('hidden'));
  const t = $('broadcastType').value;
  if (t === 'install_app') $('broadcastAppField').classList.remove('hidden');
  else if (t === 'run_script') $('broadcastScriptField').classList.remove('hidden');
  else if (t === 'set_wallpaper') $('broadcastWallpaperField').classList.remove('hidden');
});

/* Init */
if (token) { $('loginPage').classList.add('hidden'); $('app').classList.remove('hidden'); initApp(); }
