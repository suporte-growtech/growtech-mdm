const API = '/api';
const LATEST_AGENT = '1.0.0';
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
  if (id === 'mapPage') {
    if (mapInstance) setTimeout(() => mapInstance.invalidateSize(), 100);
    else loadMap();
  }
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

/* Theme toggle */
const themeIcon = $('themeIcon');
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('mdm_theme', t);
  themeIcon.innerHTML = t === 'light'
    ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
}
const savedTheme = localStorage.getItem('mdm_theme') || 'dark';
setTheme(savedTheme);
$('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  setTheme(next);
});

function initApp() { loadDashboard(); loadDevices(); loadPolicies(); loadBackups(); setInterval(loadDashboard, 15000); }

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
    api('/geolocate', { method: 'POST' }).catch(() => {});
  } catch {}
}

function formatLocation(d) {
  const parts = [];
  if (d.city) parts.push(d.city);
  if (d.region) parts.push(d.region);
  if (d.country) parts.push(d.country);
  return parts.length ? parts.join(', ') : '-';
}

function renderDevices(list) {
  $('deviceList').innerHTML = list.length
    ? list.map(d => {
        const outdated = d.agent_version && d.agent_version !== LATEST_AGENT;
        return `<tr onclick="showDeviceDetail('${d.id}')" style="cursor:pointer">
          <td><strong>${d.hostname}</strong></td>
          <td style="color:var(--text-secondary)">${d.serial_number || '-'}</td>
          <td>${d.os || '-'}</td>
          <td>${formatBytes(d.ram_total)}</td>
          <td>${formatBytes(d.disk_total)}</td>
          <td><span class="badge badge-${d.status}">${d.status === 'online' ? '●' : '○'} ${d.status}</span></td>
          <td style="font-size:12px;white-space:nowrap">${d.agent_version || '-'} ${outdated ? '<span class="badge badge-warning">desatualizado</span>' : ''}</td>
          <td style="color:var(--text-secondary);font-size:12px">${formatUptime(d.uptime)}</td>
          <td style="color:var(--text-secondary);font-size:12px">${formatLocation(d)}</td>
          <td style="color:var(--text-muted);font-size:11px">${formatDate(d.last_seen)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="10"><div class="empty-state"><div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div><p>Nenhum dispositivo conectado</p></div></td></tr>';
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
  setVal('detailLocation', formatLocation(d));
  setVal('detailWifi', d.wifi_ssid || '-');
  const v = d.agent_version || '-';
  const outdated = d.agent_version && d.agent_version !== LATEST_AGENT;
  setVal('detailAgentVersion', v + (outdated ? ' <span class="badge badge-warning">desatualizado</span>' : ''));
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

  // Load assigned policies
  try {
    const dps = await api(`/data/device_policies?device_id=${id}`);
    const container = $('detailPolicies');
    if (dps && dps.length > 0) {
      container.innerHTML = dps.map(dp =>
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <strong>${dp.policies?.name || 'Política'}</strong>
            <br><small style="color:var(--text-secondary)">${dp.policies?.description || ''}</small>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge badge-${dp.status === 'applied' ? 'active' : 'inactive'}">${dp.status === 'applied' ? '● ativa' : '○ inativa'}</span>
            <button class="btn btn-sm" onclick="togglePolicy('${dp.id}','${dp.status === 'applied' ? 'inactive' : 'applied'}')">
              ${dp.status === 'applied' ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>`
      ).join('');
    } else {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px">Nenhuma política atribuída</p>';
    }
  } catch {}

  // Load backup config
  try {
    const bc = await api(`/data/backup-config?device_id=${id}`);
    const destText = $('backupDestText');
    if (bc?.destination_path) {
      destText.textContent = bc.destination_path;
      destText.style.color = 'var(--text-primary)';
    } else {
      destText.textContent = 'Não configurado (usa C:\\BackupsGrowtech)';
      destText.style.color = 'var(--text-muted)';
    }
  } catch {}

  // Load backups
  try {
    const bks = await api(`/data/backups?device_id=${id}`);
    const bc = $('detailBackups');
    if (bks && bks.length > 0) {
      bc.innerHTML = bks.map(b =>
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <strong style="font-size:13px">${b.file_name}</strong>
            <br><small style="color:var(--text-secondary)">${(b.size_bytes / 1024 / 1024).toFixed(1)}MB • ${formatDate(b.created_at)}</small>
          </div>
          <span class="badge badge-${b.status === 'completed' ? 'active' : 'failed'}">${b.status}</span>
        </div>`
      ).join('');
    } else {
      bc.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px">Nenhum backup realizado</p>';
    }
  } catch {}
}

async function togglePolicy(id, newStatus) {
  try {
    await api('/data/device_policies', { method: 'PATCH', body: JSON.stringify({ id, status: newStatus }) });
    alert(`Política ${newStatus === 'applied' ? 'ativada' : 'desativada'}!`);
    if (currentDeviceId) showDeviceDetail(currentDeviceId);
  } catch (e) { alert(e.message); }
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
$('cmdBackup').addEventListener('click', async () => {
  if (!currentDeviceId) return;
  if (!confirm('Iniciar backup deste dispositivo? Pastas: Documents, Desktop, Outlook, Teams')) return;
  await api('/commands', { method: 'POST', body: JSON.stringify({ device_id: currentDeviceId, type: 'backup', payload: {} }) });
  alert('Backup iniciado! O resultado aparecerá na seção de Backups em alguns minutos.');
});
$('editBackupDestBtn').addEventListener('click', () => {
  if (!currentDeviceId) return;
  $('backupConfigDeviceId').value = currentDeviceId;
  $('backupConfigPath').value = $('backupDestText').textContent.includes('Não configurado') ? '' : $('backupDestText').textContent;
  $('backupConfigModal').classList.remove('hidden');
});
$('cancelBackupConfig').addEventListener('click', () => $('backupConfigModal').classList.add('hidden'));
$('saveBackupConfig').addEventListener('click', async () => {
  const did = $('backupConfigDeviceId').value;
  const path = $('backupConfigPath').value.trim();
  const type = $('backupConfigType').value;
  if (!path) { alert('Informe o caminho de destino'); return; }
  try {
    await api('/data/backup-config', { method: 'PUT', body: JSON.stringify({ device_id: did, destination_path: path, destination_type: type }) });
    $('backupConfigModal').classList.add('hidden');
    if (currentDeviceId) showDeviceDetail(currentDeviceId);
    alert('Destino do backup configurado!');
  } catch (e) { alert(e.message); }
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

const TEMPLATES = {
  block_usb: {
    name: 'Bloqueio USB',
    desc: 'Desativa portas USB de armazenamento em massa',
    priority: 10,
    settings: { block_usb: true }
  },
  lock_timeout: {
    name: 'Timeout de Tela',
    desc: 'Bloqueio automático após inatividade',
    priority: 5,
    settings: { lock_timeout: 300, screen_saver_timeout: 600 }
  },
  wallpaper: {
    name: 'Wallpaper Padrão',
    desc: 'Define wallpaper corporativo',
    priority: 3,
    settings: { wallpaper: 'default', wallpaper_path: 'C:\\Company\\wallpaper.jpg' }
  },
  restrictions: {
    name: 'Restrições do Sistema',
    desc: 'Bloqueia acesso a configurações críticas',
    priority: 8,
    settings: { block_task_manager: true, block_cmd: true, block_regedit: true, block_control_panel: false }
  },
  firewall: {
    name: 'Firewall Reforçado',
    desc: 'Ativa e reforça regras do firewall',
    priority: 7,
    settings: { enable_firewall: true, block_incoming: true, block_outgoing_rules: false }
  },
  privacy: {
    name: 'Privacidade e Rastreamento',
    desc: 'Desativa telemetria e rastreamento',
    priority: 4,
    settings: { disable_telemetry: true, disable_cortana: true, disable_ads: true, disable_location: false }
  },
  allowed_apps: {
    name: 'Apps Permitidos',
    desc: 'Bloqueia instalação de apps não autorizados',
    priority: 9,
    settings: { allowed_apps: ['Chrome', 'Teams', 'Outlook', 'ChatGPT', 'WhatsApp'] }
  }
};

function loadTemplate(key) {
  const t = TEMPLATES[key];
  if (!t) return;
  $('policyName').value = t.name;
  $('policyDesc').value = t.desc;
  $('policyPriority').value = t.priority;
  $('policySettings').value = JSON.stringify(t.settings, null, 2);
}

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

/* Backups */
let backupPollTimer = null;

async function loadBackups() {
  try {
    const bks = await api('/data/backups');
    $('backupList').innerHTML = bks && bks.length > 0
      ? bks.map(b =>
          `<tr>
            <td><strong>${b.devices?.hostname || '—'}</strong></td>
            <td style="color:var(--text-secondary);font-size:12px">${b.file_name}</td>
            <td>${(b.size_bytes / 1024 / 1024).toFixed(1)} MB</td>
            <td style="font-size:12px">${formatDate(b.created_at)}</td>
            <td><span class="badge badge-${b.status === 'completed' ? 'active' : 'failed'}">${b.status}</span></td>
          </tr>`
        ).join('')
      : '<tr><td colspan="5"><div class="empty-state"><p>Nenhum backup realizado</p></div></td></tr>';

    // Check for in-progress backups
    const pending = await api('/commands?status=sent&type=backup').catch(() => []);
    if (pending && pending.length > 0) {
      const c = pending[0];
      const p = c.result?.progress || 0;
      $('backupProgress').classList.remove('hidden');
      $('backupProgressBar').style.width = p + '%';
      $('backupProgressPct').textContent = p + '%';
      $('backupProgressText').textContent = c.result?.message || 'Backup em andamento...';
      if (backupPollTimer) clearTimeout(backupPollTimer);
      backupPollTimer = setTimeout(loadBackups, 3000);
    } else {
      $('backupProgress').classList.add('hidden');
    }
  } catch {}
}

$('backupAllBtn').addEventListener('click', async () => {
  if (!confirm('Iniciar backup de TODOS os dispositivos online?\nPastas: Documents, Desktop, Outlook, Teams')) return;
  try {
    const res = await api('/broadcast', { method: 'POST', body: JSON.stringify({ type: 'backup', payload: {} }) });
    alert(`Backup enviado para ${res.sent} dispositivo(s)!`);
    loadBackups();
  } catch (e) { alert(e.message); }
});

/* Map */
let mapInstance = null;
let mapMarkers = [];

async function loadMap() {
  const data = await api('/devices').catch(() => []);
  const located = data.filter(d => d.latitude && d.longitude);

  if (!mapInstance && $('deviceMap')) {
    mapInstance = L.map('deviceMap').setView([-14.235, -51.9253], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(mapInstance);
  }

  if (mapInstance) {
    mapMarkers.forEach(m => mapInstance.removeLayer(m));
    mapMarkers = [];
    located.forEach(d => {
      const popup = `<strong>${d.hostname}</strong><br>${formatLocation(d)}<br>${d.wifi_ssid ? 'Wi-Fi: ' + d.wifi_ssid : ''}<br>${d.status}`;
      const m = L.circleMarker([d.latitude, d.longitude], {
        radius: 8, fillColor: d.status === 'online' ? '#22c55e' : '#5c5f7a',
        color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.8,
      }).addTo(mapInstance).bindPopup(popup);
      mapMarkers.push(m);
    });
    if (located.length > 0) mapInstance.fitBounds(mapMarkers.map(m => m.getLatLng()), { padding: [40, 40] });
  }

  $('locationList').innerHTML = located.length
    ? located.map(d =>
        `<div class="stat-card" style="cursor:pointer" onclick="showDeviceDetail('${d.id}')">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <strong>${d.hostname}</strong>
            <span class="badge badge-${d.status}" style="font-size:10px">${d.status}</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary)">
            ${formatLocation(d)} ${d.wifi_ssid ? '• ' + d.wifi_ssid : ''}
          </div>
        </div>`
      ).join('')
    : '<p style="color:var(--text-muted);text-align:center;padding:32px">Nenhum dispositivo com localização disponível</p>';
}

$('refreshMap').addEventListener('click', async () => {
  await api('/geolocate', { method: 'POST' }).catch(() => {});
  loadMap();
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
