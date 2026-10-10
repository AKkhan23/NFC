/**
 * One-command LAN starter: `npm run dev:lan`
 *
 * - Auto-detects this PC's LAN IP (e.g. 192.168.1.27)
 * - Patches root .env (CLIENT_URL / CORS_ORIGINS / SOCKET_URL) and
 *   client/.env (VITE_SOCKET_URL) so the phone can reach the API
 * - Starts API :4000 + web UI :5173 bound to 0.0.0.0
 *
 * Phone (same WiFi):  http://<LAN-IP>:5173
 * This PC:            http://localhost:5173
 * Tap links on cards use the phone URL — plain HTTP is fine for them.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function lanIp() {
  const nets = networkInterfaces();
  const candidates = [];
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) {
      if (n.family === 'IPv4' && !n.internal) candidates.push(n.address);
    }
  }
  return (
    candidates.find((ip) => ip.startsWith('192.168.')) ??
    candidates.find((ip) => ip.startsWith('10.')) ??
    candidates.find((ip) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) ??
    candidates[0]
  );
}

function upsertEnv(path, updates) {
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (text && !text.endsWith('\n')) text += '\n';
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${key}=${value}`);
    else text += `${key}=${value}\n`;
  }
  writeFileSync(path, text);
}

function mergeOrigins(current, needed) {
  const parts = String(current ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of needed) if (!parts.includes(o)) parts.push(o);
  return parts.join(',');
}

const ip = lanIp();
if (!ip) {
  console.error('[dev:lan] No LAN IP found. Connect to WiFi first.');
  process.exit(1);
}

const ui = `http://${ip}:5173`;
const api = `http://${ip}:4000`;

// Root .env
const rootEnvPath = join(root, '.env');
const rootEnv = existsSync(rootEnvPath) ? readFileSync(rootEnvPath, 'utf8') : '';
const corsLine = rootEnv.match(/^CORS_ORIGINS=(.*)$/m)?.[1] ?? '';
upsertEnv(rootEnvPath, {
  CLIENT_URL: ui,
  CORS_ORIGINS: mergeOrigins(corsLine, ['http://localhost:5173', ui]),
  SOCKET_URL: api,
});

// Client .env (Vite reads at startup)
upsertEnv(join(root, 'client', '.env'), { VITE_SOCKET_URL: api });

console.log('');
console.log('[dev:lan] LAN IP:', ip);
console.log('[dev:lan] PC:   http://localhost:5173');
console.log(`[dev:lan] Phone: ${ui}  (same WiFi)`);
console.log('[dev:lan] API:  ', api);
console.log('[dev:lan] If Windows Firewall asks, click "Allow access".');
console.log('');

const procs = [
  spawn('npm', ['run', 'dev', '-w', 'server'], { cwd: root, stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev', '-w', 'client', '--', '--host', '0.0.0.0', '--port', '5173'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }),
];

const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('exit', stop);
