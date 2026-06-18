const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function main() {
  const tmp = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'growtech_test_firefox.exe');
  console.log('Downloading Firefox...');
  const res = await fetch('https://download.mozilla.org/?product=firefox-latest&os=win64&lang=pt-BR', { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmp, buf);
  console.log('Saved', buf.length, 'bytes to', tmp);
  console.log('Installing...');
  execSync('"' + tmp + '" /quiet /norestart', { timeout: 300000, stdio: 'pipe' });
  console.log('Install done');
  try { fs.unlinkSync(tmp); } catch {}
  console.log('Cleanup done');
}

main().catch(e => console.error('Error:', e.message));
