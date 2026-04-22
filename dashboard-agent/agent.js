import express from 'express';
import { exec, execSync } from 'child_process';
import os from 'os';
import fs from 'fs';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://192.168.0.20:9000';
const PORT = 9001;

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (name.startsWith('lo')) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '0.0.0.0';
}

function getActiveIfaceNames() {
  const ifaces = os.networkInterfaces();
  const names = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (name.startsWith('lo')) continue;
    if (addrs.some(a => a.family === 'IPv4' && !a.internal)) names.push(name);
  }
  return names;
}

function getPermanentMac() {
  if (process.platform === 'darwin') {
    try {
      // networksetup always returns the permanent hardware MAC, never the randomized one
      const out = execSync('/usr/sbin/networksetup -listallhardwareports', { encoding: 'utf8' });
      // Prefer a wired ethernet adapter for WoL
      const ethernetMatch = out.match(/Hardware Port: (Thunderbolt Ethernet|USB.*LAN|Ethernet)\nDevice[^\n]*\nEthernet Address: ([0-9a-f:]+)/i);
      if (ethernetMatch) return ethernetMatch[2];
      // Fall back to Wi-Fi permanent MAC
      const wifiMatch = out.match(/Hardware Port: Wi-Fi\nDevice[^\n]*\nEthernet Address: ([0-9a-f:]+)/i);
      if (wifiMatch) return wifiMatch[1];
    } catch { /* fall through */ }
  }
  // Linux: networkInterfaces() returns the permanent hardware MAC
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (name.startsWith('lo')) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && addr.mac !== '00:00:00:00:00:00') {
        return addr.mac;
      }
    }
  }
  return null;
}

function getConnectionTypes() {
  const ifaceNames = getActiveIfaceNames();
  const types = new Set();

  if (process.platform === 'darwin') {
    try {
      const out = execSync('/usr/sbin/networksetup -listallhardwareports', { encoding: 'utf8' });
      // Build device→type map from all blocks
      const deviceTypeMap = {};
      for (const block of out.split(/\n{2,}/)) {
        const deviceMatch = block.match(/Device:\s*(\S+)/i);
        const portMatch   = block.match(/Hardware Port:\s*(.+)/i);
        if (!deviceMatch || !portMatch) continue;
        const port = portMatch[1].trim().toLowerCase();
        if (port.includes('bluetooth')) continue;
        deviceTypeMap[deviceMatch[1].trim()] = (port.includes('wi-fi') || port.includes('wifi')) ? 'wifi' : 'ethernet';
      }
for (const name of ifaceNames) {
        if (deviceTypeMap[name]) types.add(deviceTypeMap[name]);
      }
    } catch { /* fall through */ }
  } else {
    for (const name of ifaceNames) {
      try {
        fs.statSync(`/sys/class/net/${name}/wireless`);
        types.add('wifi');
      } catch {
        types.add('ethernet');
      }
    }
  }

  return [...types];
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
  const ip  = getLocalIP();
  const mac = getPermanentMac();
  const osName = getOsName();
  const connection_types = getConnectionTypes();
  try {
    await fetch(`${DASHBOARD_URL}/api/machines/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: os.hostname(), ip_address: ip, mac, os: osName, agent_port: PORT, connection_types }),
    });
    console.log(`[Agent] Registered with ${DASHBOARD_URL} (${connection_types.join('+')}`);
  } catch (err) {
    console.error(`[Agent] Registration failed: ${err.message}`);
  }
}

app.listen(PORT, () => {
  console.log(`[Agent] Running on port ${PORT}`);
  register();
  setInterval(register, 30000);
});
