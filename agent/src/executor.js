const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
