const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function findWinget() {
  const candidates = [
    'winget',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'winget.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'winget.exe'),
    'C:\\Program Files\\WindowsApps\\winget.exe',
  ];
  for (const c of candidates) {
    try { execSync(`"${c}" --version`, { timeout: 3000, stdio: 'ignore' }); return c; } catch {}
  }
  // Search common user directories
  const users = ['ADM', 'Administrator', 'Public'];
  for (const u of users) {
    const p = `C:\\Users\\${u}\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe`;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function installWithWinget(name) {
  const winget = await findWinget();
  if (!winget) return null;
  execSync(`"${winget}" install --name "${name}" --silent --accept-package-agreements --accept-source-agreements`, { timeout: 300000 });
  return `${name} instalado via winget`;
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
          const msg = await installWithWinget(payload.name);
          if (msg) return { status: 'executed', result: { message: msg } };
          return { status: 'failed', result: { error: 'winget não encontrado no sistema. Use o campo "Caminho do Instalador" com o caminho de um .exe ou .msi' } };
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
