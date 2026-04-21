import express from 'express';
import { exec } from 'child_process';
import os from 'os';
import fs from 'fs';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://192.168.0.20:9000';
const PORT = 9001;

function getNetworkInfo() {
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (name.startsWith('lo')) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && addr.mac !== '00:00:00:00:00:00') {
        return { ip: addr.address, mac: addr.mac };
      }
    }
  }
  return { ip: '0.0.0.0', mac: '00:00:00:00:00:00' };
}

function getOsName() {
  if (process.platform === 'darwin') return 'macOS';
  try {
    const rel = fs.readFileSync('/etc/os-release', 'utf8');
    const m = rel.match(/^PRETTY_NAME="(.+)"/m);
    return m ? m[1] : 'Linux';
  } catch { return 'Linux'; }
}

const app = express();
app.use(express.json());

app.get('/ping', (_req, res) => {
  res.json({ ok: true, hostname: os.hostname() });
});

app.post('/shutdown', (_req, res) => {
  res.json({ ok: true });
  setTimeout(() => {
    const cmd = process.platform === 'darwin' ? '/sbin/shutdown -h now' : '/sbin/shutdown -h now';
    exec(cmd, (err, _stdout, stderr) => {
      if (err) console.error('Shutdown failed:', stderr || err.message);
    });
  }, 500);
});

async function register() {
  const { ip, mac } = getNetworkInfo();
  const osName = getOsName();
  try {
    await fetch(`${DASHBOARD_URL}/api/machines/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: os.hostname(), ip_address: ip, mac, os: osName, agent_port: PORT }),
    });
    console.log(`[Agent] Registered with ${DASHBOARD_URL}`);
  } catch (err) {
    console.error(`[Agent] Registration failed: ${err.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`[Agent] Running on port ${PORT}`);
  register();
  setInterval(register, 30000);
});
