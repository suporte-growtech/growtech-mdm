const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const INSTALLER_URLS = {
  firefox: 'https://download.mozilla.org/?product=firefox-latest&os=win64&lang=pt-BR',
  chrome: 'https://dl.google.com/chrome/install/latest/chrome_installer.exe',
  'google chrome': 'https://dl.google.com/chrome/install/latest/chrome_installer.exe',
  '7zip': 'https://www.7-zip.org/a/7z2409-x64.exe',
  '7-zip': 'https://www.7-zip.org/a/7z2409-x64.exe',
  vlc: 'https://get.videolan.org/vlc/3.0.21/win64/vlc-3.0.21-win64.exe',
  spotify: 'https://download.spotify.com/SpotifySetup.exe',
  discord: 'https://discord.com/api/downloads/distributions/app/installers/latest?channel=stable&platform=win&arch=x64',
  telegram: 'https://telegram.org/dl/desktop/win64',
  whatsapp: 'https://web.whatsapp.com/desktop/windows/release/x64/WhatsAppSetup.exe',
  'mozilla firefox': 'https://download.mozilla.org/?product=firefox-latest&os=win64&lang=pt-BR',
  'google chrome': 'https://dl.google.com/chrome/install/latest/chrome_installer.exe',
};

async function downloadInstaller(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

async function installApp(name) {
  const key = name.toLowerCase().trim();
  const url = INSTALLER_URLS[key];

  if (url) {
    const tmp = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `growtech_install_${Date.now()}.exe`);
    try {
      await downloadInstaller(url, tmp);
      execSync(`"${tmp}" /quiet /norestart`, { timeout: 300000 });
      try { fs.unlinkSync(tmp); } catch {}
      return `${name} instalado com sucesso`;
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      throw e;
    }
  }

  // Try winget as fallback
  try {
    execSync(`winget install --name "${name}" --silent --accept-package-agreements --accept-source-agreements`, { timeout: 300000, stdio: 'pipe' });
    return `${name} instalado via winget`;
  } catch {}

  throw new Error(`App "${name}" não reconhecido. Use "Caminho do Instalador" com um .exe ou .msi, ou escolha: ${Object.keys(INSTALLER_URLS).join(', ')}`);
}

async function executeCommand(command) {
  const { id, type, payload } = command;

  switch (type) {
    case 'install_app': {
      try {
        if (payload?.path || payload?.url) {
          const installerPath = payload.path || payload.url;
          execSync(`"${installerPath}" /quiet /norestart`, { timeout: 300000 });
          return { status: 'executed', result: { message: 'Instalação concluída' } };
        }
        if (payload?.name) {
          const msg = await installApp(payload.name);
          return { status: 'executed', result: { message: msg } };
        }
        return { status: 'failed', result: { error: 'Nome, caminho ou URL do instalador obrigatório' } };
      } catch (err) {
        return { status: 'failed', result: { error: err.message } };
      }
    }

    case 'uninstall_app': {
      if (!payload?.name) return { status: 'failed', result: { error: 'Nome do app não fornecido' } };
      try {
        execSync(`wmic product where "name = '${payload.name}'" call uninstall /nointeractive`, { timeout: 120000 });
        return { status: 'executed', result: { message: `${payload.name} removido` } };
      } catch (err) {
        return { status: 'failed', result: { error: err.message } };
      }
    }

    case 'run_script': {
      if (!payload?.script) return { status: 'failed', result: { error: 'Script não fornecido' } };
      try {
        const result = execSync(payload.script, {
          timeout: (payload.timeout || 60) * 1000,
          shell: 'powershell.exe', encoding: 'utf8',
        });
        return { status: 'executed', result: { stdout: result } };
      } catch (err) {
        return { status: 'failed', result: { error: err.message, stdout: err.stdout } };
      }
    }

    case 'shutdown': {
      const delay = payload?.delay || 0;
      execSync(`shutdown /s /t ${delay} /c "Growtech MDM: Desligamento remoto"`, { timeout: 5000 });
      return { status: 'executed', result: { message: `Desligando em ${delay}s` } };
    }

    case 'restart': {
      const delay = payload?.delay || 0;
      execSync(`shutdown /r /t ${delay} /c "Growtech MDM: Reinicialização remota"`, { timeout: 5000 });
      return { status: 'executed', result: { message: `Reiniciando em ${delay}s` } };
    }

    case 'lock': {
      execSync('rundll32.exe user32.dll,LockWorkStation', { timeout: 5000 });
      return { status: 'executed', result: { message: 'Tela bloqueada' } };
    }

    case 'set_wallpaper': {
      if (!payload?.image_path) return { status: 'failed', result: { error: 'Caminho da imagem não fornecido' } };
      try {
        const imgPath = payload.image_path;
        const code = `
          Add-Type -TypeDefinition @"
          using System; using System.Runtime.InteropServices;
          public class Wallpaper {
            [DllImport("user32.dll", CharSet=CharSet.Auto)]
            public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
          }
"@
          [Wallpaper]::SystemParametersInfo(20, 0, '${imgPath.replace(/'/g, "''")}', 2)
        `;
        execSync(`powershell -Command "${code.replace(/"/g, '\\"')}"`, { timeout: 10000 });
        return { status: 'executed', result: { message: 'Wallpaper atualizado' } };
      } catch (err) {
        return { status: 'failed', result: { error: err.message } };
      }
    }

    case 'block_usb': {
      const action = payload?.block ? 1 : 0;
      try {
        execSync(`powershell -Command "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\UsbStor' -Name 'Start' -Value ${action}"`, { timeout: 10000 });
        return { status: 'executed', result: { message: payload?.block ? 'USB bloqueado' : 'USB liberado' } };
      } catch (err) {
        return { status: 'failed', result: { error: err.message } };
      }
    }

    case 'update_policy': {
      return { status: 'executed', result: { message: 'Política recebida', settings: payload?.settings } };
    }

    case 'backup': {
      const folders = payload?.folders || [
        'C:\\Users\\ADM\\Documents',
        'C:\\Users\\ADM\\Desktop',
        'C:\\Users\\ADM\\AppData\\Roaming\\Microsoft\\Outlook',
        'C:\\Users\\ADM\\AppData\\Roaming\\Microsoft\\Teams',
      ];
      const tmpDir = (process.env.TEMP || 'C:\\Windows\\Temp').replace(/\\$/, '');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const zipName = `growtech_backup_${os.hostname()}_${timestamp}.zip`;
      const zipPath = `${tmpDir}\\${zipName}`;
      const fs = require('fs');
      const existentFolders = folders.filter(f => fs.existsSync(f));
      if (existentFolders.length === 0) return { status: 'failed', result: { error: 'Nenhuma pasta encontrada para backup' } };

      try {
        // Update progress
        const supabase = require('@supabase/supabase-js').createClient(
          process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY
        );
        const updateProgress = async (pct, msg) => {
          try { await supabase.from('commands').update({ result: { progress: pct, message: msg } }).eq('id', command.id); } catch {}
        };

        await updateProgress(10, 'Compactando pastas...');

        // Write PowerShell script to temp file (Fastest compression to avoid hanging)
        const psScriptPath = `${tmpDir}\\growtech_zip_${Date.now()}.ps1`;
        const folderList = existentFolders.map(f => `'${f.replace(/'/g, "''")}'`).join(',');
        const psContent = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ErrorActionPreference = 'Stop'
$tmpParent = Join-Path $env:TEMP "growtech_links_$(Get-Random)"
try {
  New-Item -ItemType Directory -Path $tmpParent -Force | Out-Null
  $folders = @(${folderList})
  $folders | ForEach-Object {
    $name = Split-Path $_ -Leaf
    $target = $_
    $link = "$tmpParent\$name"
    $null = cmd /c "mklink /J \`"$link\`" \`"$target\`" 2>nul"
    if (-not (Test-Path $link)) { throw "Falha ao criar junction para $target" }
  }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($tmpParent, '${zipPath.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Fastest, $false)
} finally {
  Remove-Item $tmpParent -Recurse -Force -ErrorAction SilentlyContinue
}
`.trim();
        fs.writeFileSync(psScriptPath, psContent, 'utf8');

        // Run compression asynchronously with periodic progress updates
        const progressInterval = setInterval(async () => {
          try {
            if (fs.existsSync(zipPath)) {
              const stat = fs.statSync(zipPath);
              const pct = Math.min(55, Math.round(10 + (stat.size / (1024 * 1024 * 1024)) * 45));
              await updateProgress(pct, `Compactando pastas... (${(stat.size / 1024 / 1024).toFixed(0)}MB)`);
            }
          } catch {}
        }, 5000);

        await new Promise((resolve, reject) => {
          let stderr = '';
          const child = exec(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`, { timeout: 600000 });
          child.stderr.on('data', (data) => { stderr += data.toString(); });
          child.on('close', (code) => {
            clearInterval(progressInterval);
            if (code !== 0) reject(new Error(stderr.trim() || `PowerShell exit code ${code}`));
            else resolve();
          });
          child.on('error', (err) => {
            clearInterval(progressInterval);
            reject(err);
          });
        });
        try { fs.unlinkSync(psScriptPath); } catch {}

        await updateProgress(60, 'Compactação concluída. Verificando...');

        const stat = fs.statSync(zipPath);
        const fileName = require('path').basename(zipPath);

        // Read backup config
        const { data: config } = await supabase
          .from('backup_config')
          .select('destination_path, destination_type')
          .eq('device_id', command.device_id)
          .maybeSingle();

        let storageUrl = '';

        await updateProgress(70, 'Copiando para destino...');

        if (config?.destination_path) {
          const destDir = config.destination_path.replace(/\/+$/, '');
          const dest = destDir + '\\' + zipName;
          try {
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            execSync(`xcopy "${zipPath}" "${dest}" /Y`, { timeout: 30000 });
            storageUrl = dest;
          } catch (copyErr) {
            storageUrl = zipPath;
          }
        } else {
          const publicDest = `C:\\BackupsGrowtech\\${zipName}`;
          try {
            if (!fs.existsSync('C:\\BackupsGrowtech')) fs.mkdirSync('C:\\BackupsGrowtech', { recursive: true });
            fs.copyFileSync(zipPath, publicDest);
            storageUrl = publicDest;
          } catch { storageUrl = zipPath; }
        }

        await updateProgress(90, 'Registrando backup...');

        await supabase.from('backups').insert({
          device_id: command.device_id,
          file_name: fileName,
          size_bytes: stat.size,
          folders: existentFolders.join(';'),
          storage_url: storageUrl,
          status: 'completed'
        });

        return { status: 'executed', result: { progress: 100, message: `Backup criado: ${(stat.size / 1024 / 1024).toFixed(1)}MB`, path: storageUrl } };
      } catch (err) {
        return { status: 'failed', result: { error: err.message, progress: 0 } };
      }
    }

    case 'system_info': {
      const si = require('./system');
      const info = await si.getSystemInfo();
      return { status: 'executed', result: info };
    }

    default:
      return { status: 'failed', result: { error: `Comando desconhecido: ${type}` } };
  }
}

module.exports = { executeCommand };
