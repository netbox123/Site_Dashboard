import express from 'express';
import { spawn, execSync, exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import fs, { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createConnection } from 'net';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer } from 'ws';
import dgram from 'dgram';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pty = require('node-pty');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITES_FILE  = path.join(__dirname, 'config', 'websites.json');
const PAGES_FILE     = path.join(__dirname, 'config', 'pages.json');
const MACHINES_FILE  = path.join(__dirname, 'config', 'machines.json');
const LOGS_DIR      = path.join(__dirname, 'logs');
const DASHBOARD_PORT = 9000;
const MAX_LOG_ENTRIES = 500;

// ── Logging ──────────────────────────────────────────────────────────────────

function stamp(text) {
  const ts = new Date().toLocaleString('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).replace(',', '');
  return text.split('\n').map(l => (l.trim() ? `[${ts}] ${l}` : l)).join('\n');
}

const DASHBOARD_LOG_FILE = path.join(__dirname, 'logs', 'dashboard.jsonl');

function appendDashboardLog(level, text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return;
  const ts = new Date().toLocaleString('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).replace(',', '');
  const entries = lines.map(t => JSON.stringify({ ts, level, text: t })).join('\n') + '\n';
  try {
    fs.appendFileSync(DASHBOARD_LOG_FILE, entries);
    const content = readFileSync(DASHBOARD_LOG_FILE, 'utf8');
    const all = content.split('\n').filter(Boolean);
    if (all.length > MAX_LOG_ENTRIES) {
      writeFileSync(DASHBOARD_LOG_FILE, all.slice(-MAX_LOG_ENTRIES).join('\n') + '\n');
    }
  } catch { /* ignore */ }
}

const _log = console.log.bind(console);
const _err = console.error.bind(console);
console.log = (...a) => { const s = a.join(' '); _log(stamp(s)); appendDashboardLog('stdout', s); };
console.error = (...a) => { const s = a.join(' '); _err(stamp(s)); appendDashboardLog('stderr', s); };

// ── Per-site JSON logs ────────────────────────────────────────────────────────

function siteLogFile(id) {
  return path.join(LOGS_DIR, `${id}.jsonl`);
}

function appendSiteLog(id, level, text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return;
  const ts = new Date().toLocaleString('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).replace(',', '');
  const file = siteLogFile(id);
  const entries = lines.map(t => JSON.stringify({ ts, level, text: t })).join('\n') + '\n';
  fs.appendFileSync(file, entries);
  // Trim to MAX_LOG_ENTRIES
  try {
    const content = readFileSync(file, 'utf8');
    const all = content.split('\n').filter(Boolean);
    if (all.length > MAX_LOG_ENTRIES) {
      writeFileSync(file, all.slice(-MAX_LOG_ENTRIES).join('\n') + '\n');
    }
  } catch { /* ignore */ }
}

function readSiteLog(id) {
  try {
    const content = readFileSync(siteLogFile(id), 'utf8');
    return content.split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch { return []; }
}

function clearSiteLog(id) {
  try { fs.writeFileSync(siteLogFile(id), ''); } catch { /* ignore */ }
}

// ── Config helpers ────────────────────────────────────────────────────────────

function loadWebsites() {
  return JSON.parse(readFileSync(WEBSITES_FILE, 'utf8'));
}

function saveWebsites(sites) {
  writeFileSync(WEBSITES_FILE, JSON.stringify(sites, null, 2));
}

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// ── Port helpers ──────────────────────────────────────────────────────────────

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const client = createConnection({ port, host: '127.0.0.1' });
    client.once('connect', () => { client.destroy(); resolve(true); });
    client.once('error', () => { client.destroy(); resolve(false); });
  });
}

function killByPort(port) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const pid of pids) process.kill(Number(pid), 'SIGTERM');
    return pids.length > 0;
  } catch { return false; }
}

async function getSiteStatus(site) {
  const inMemory = !!runningProcesses[site.id];
  const portBusy = await isPortInUse(site.port);
  return { ...site, running: inMemory || portBusy, managedByDashboard: inMemory };
}

// In-memory process registry
const runningProcesses = {};

// ── GUI route ─────────────────────────────────────────────────────────────────

app.get('/gui', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gui.html'));
});

// ── Install routes ────────────────────────────────────────────────────────────

app.get('/install', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'install.html'));
});

app.get('/api/install/agent.js', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.sendFile(path.join(__dirname, 'dashboard-agent', 'agent.js'));
});

app.get('/api/install/package.json', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.sendFile(path.join(__dirname, 'dashboard-agent', 'package.json'));
});

app.get('/api/install/mac', (req, res) => {
  const dashboardUrl = `http://${req.hostname}:${DASHBOARD_PORT}`;
  const nodeEnvPath = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
  const script = `#!/bin/bash
set -e

DASHBOARD_URL="${dashboardUrl}"
INSTALL_DIR="/usr/local/dashboard-agent"
PLIST_PATH="/Library/LaunchDaemons/com.dashboard.agent.plist"
NODE_BIN="$(which node 2>/dev/null || echo /usr/local/bin/node)"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: curl -fsSL $\\{DASHBOARD_URL\\}/api/install/mac | sudo bash"
  exit 1
fi

echo "→ Dashboard: $DASHBOARD_URL"
echo "→ Node:      $NODE_BIN"
echo "→ Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

echo "→ Downloading agent files"
curl -fsSL "$DASHBOARD_URL/api/install/agent.js"      -o "$INSTALL_DIR/agent.js"
curl -fsSL "$DASHBOARD_URL/api/install/package.json"  -o "$INSTALL_DIR/package.json"

echo "→ Installing dependencies"
cd "$INSTALL_DIR"
npm install --production --silent

echo "→ Writing launchd plist"
cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dashboard.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$INSTALL_DIR/agent.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DASHBOARD_URL</key>
    <string>$DASHBOARD_URL</string>
    <key>PATH</key>
    <string>${nodeEnvPath}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>/var/log/dashboard-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/dashboard-agent-error.log</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST_PATH" 2>/dev/null || true
echo "→ Loading service"
launchctl load "$PLIST_PATH"

echo ""
echo "✓ Agent installed and started"
echo "  Logs:  /var/log/dashboard-agent.log"
echo "  Error: /var/log/dashboard-agent-error.log"
echo ""
echo "  To uninstall:"
echo "    sudo launchctl unload $PLIST_PATH && sudo rm -rf $INSTALL_DIR $PLIST_PATH"
`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(script);
});

app.get('/api/install/linux', (req, res) => {
  const dashboardUrl = `http://${req.hostname}:${DASHBOARD_PORT}`;
  const script = `#!/bin/bash
set -e

DASHBOARD_URL="${dashboardUrl}"
INSTALL_DIR="/usr/local/dashboard-agent"
SERVICE_PATH="/etc/systemd/system/dashboard-agent.service"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: curl -fsSL $\\{DASHBOARD_URL\\}/api/install/linux | sudo bash"
  exit 1
fi

# Install dependencies if not present
if ! command -v ethtool &>/dev/null; then
  apt-get install -y ethtool
fi

if ! command -v node &>/dev/null; then
  echo "→ Node.js not found, installing via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

NODE_BIN="$(which node)"
echo "→ Dashboard: $DASHBOARD_URL"
echo "→ Node:      $NODE_BIN"
echo "→ Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

echo "→ Downloading agent files"
curl -fsSL "$DASHBOARD_URL/api/install/agent.js"     -o "$INSTALL_DIR/agent.js"
curl -fsSL "$DASHBOARD_URL/api/install/package.json" -o "$INSTALL_DIR/package.json"

echo "→ Installing dependencies"
cd "$INSTALL_DIR"
npm install --production --silent

echo "→ Writing systemd service"
cat > "$SERVICE_PATH" << SERVICE
[Unit]
Description=Dashboard Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN $INSTALL_DIR/agent.js
Restart=always
RestartSec=5
Environment=DASHBOARD_URL=$DASHBOARD_URL

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable dashboard-agent
systemctl restart dashboard-agent

# Set up Wake on LAN — detect the active ethernet interface and enable WoL
WOL_IFACE="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}' | head -1)"
if [ -n "$WOL_IFACE" ] && command -v ethtool &>/dev/null; then
  echo "→ Enabling Wake on LAN on $WOL_IFACE"
  ethtool -s "$WOL_IFACE" wol g 2>/dev/null || true
  cat > /etc/systemd/system/wol.service << WOL
[Unit]
Description=Enable Wake on LAN on $WOL_IFACE
After=network.target

[Service]
Type=oneshot
ExecStart=/sbin/ethtool -s $WOL_IFACE wol g

[Install]
WantedBy=multi-user.target
WOL
  systemctl daemon-reload
  systemctl enable wol.service
  systemctl start wol.service
else
  echo "  ⚠ Could not auto-detect interface — enable WoL manually: sudo ethtool -s <iface> wol g"
fi

echo ""
echo "✓ Agent installed and started"
echo "  Status: systemctl status dashboard-agent"
echo "  Logs:   journalctl -u dashboard-agent -f"
echo ""
echo "  To uninstall:"
echo "    systemctl disable --now dashboard-agent && rm -rf $INSTALL_DIR $SERVICE_PATH"
`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(script);
});

// ── Pages API ─────────────────────────────────────────────────────────────────

app.get('/api/pages', (_req, res) => {
  try {
    res.json(JSON.parse(readFileSync(PAGES_FILE, 'utf8')));
  } catch { res.json([]); }
});

// ── Machines API ──────────────────────────────────────────────────────────────

function loadMachines() {
  try { return JSON.parse(readFileSync(MACHINES_FILE, 'utf8')); } catch { return []; }
}

function saveMachines(machines) {
  writeFileSync(MACHINES_FILE, JSON.stringify(machines, null, 2));
}

function sendWoL(mac) {
  const bytes = mac.replace(/[:-]/g, '').match(/.{2}/g).map(b => parseInt(b, 16));
  const packet = Buffer.alloc(102);
  packet.fill(0xff, 0, 6);
  for (let i = 1; i <= 16; i++) bytes.forEach((b, j) => { packet[6 + (i - 1) * 6 + j] = b; });
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.once('listening', () => sock.setBroadcast(true));
    sock.send(packet, 0, packet.length, 9, '255.255.255.255', err => {
      sock.close();
      err ? reject(err) : resolve();
    });
  });
}

app.get('/api/machines', (_req, res) => {
  const machines = loadMachines();
  const now = Date.now();
  res.json(machines.map(m => ({
    ...m,
    online: m.last_seen ? (now - new Date(m.last_seen).getTime()) < 60000 : false,
  })));
});

app.post('/api/machines/register', (req, res) => {
  const { name, ip_address, mac, os: osName, agent_port } = req.body ?? {};
  if (!name || !ip_address || !mac) return res.status(400).json({ error: 'name, ip_address and mac are required' });
  const machines = loadMachines();
  const last_seen = new Date().toISOString();
  let machine = machines.find(m => m.mac === mac);
  if (machine) {
    Object.assign(machine, { name, ip_address, mac, os: osName, agent_port, last_seen });
  } else {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    machine = { id, name, ip_address, mac, os: osName, agent_port, last_seen };
    machines.push(machine);
  }
  saveMachines(machines);
  console.log(`[Machines] Registered: ${name} (${ip_address})`);
  res.json(machine);
});

app.post('/api/machines/:id/shutdown', async (req, res) => {
  const machine = loadMachines().find(m => m.id === req.params.id);
  if (!machine) return res.status(404).json({ error: 'Machine not found' });
  if (!machine.ip_address || !machine.agent_port) return res.status(400).json({ error: 'No agent info for this machine' });
  try {
    const r = await fetch(`http://${machine.ip_address}:${machine.agent_port}/shutdown`, { method: 'POST' });
    if (!r.ok) throw new Error(`Agent responded with ${r.status}`);
    console.log(`[Machines] Shutdown sent to ${machine.name}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/machines/:id/wake', async (req, res) => {
  const machine = loadMachines().find(m => m.id === req.params.id);
  if (!machine) return res.status(404).json({ error: 'Machine not found' });
  if (!machine.mac) return res.status(400).json({ error: 'No MAC address stored for this machine' });
  try {
    await sendWoL(machine.mac);
    console.log(`[Machines] WoL sent to ${machine.name} (${machine.mac})`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Websites API ──────────────────────────────────────────────────────────────

app.get('/api/websites', async (_req, res) => {
  const sites = loadWebsites();
  const statuses = await Promise.all(sites.map(getSiteStatus));
  res.json(statuses);
});

app.post('/api/websites', (req, res) => {
  const { id, name, path: sitePath, command, args, port, autoStart } = req.body;
  if (!id || !name || !sitePath || !command || !port)
    return res.status(400).json({ error: 'Missing required fields: id, name, path, command, port' });
  const sites = loadWebsites();
  if (sites.find(s => s.id === id))
    return res.status(409).json({ error: `Website with id "${id}" already exists` });
  const newSite = { id, name, path: sitePath, command, args: args || [], port, autoStart: !!autoStart };
  sites.push(newSite);
  saveWebsites(sites);
  res.status(201).json(newSite);
});

app.patch('/api/websites/:id', (req, res) => {
  const sites = loadWebsites();
  const site = sites.find(s => s.id === req.params.id);
  if (!site) return res.status(404).json({ error: 'Website not found' });
  const allowed = ['name', 'path', 'command', 'args', 'port', 'autoStart', 'build_command', 'build_args', 'build_path'];
  allowed.forEach(k => { if (req.body[k] !== undefined) site[k] = req.body[k]; });
  saveWebsites(sites);
  res.json(site);
});

app.delete('/api/websites/:id', (req, res) => {
  const sites = loadWebsites();
  const idx = sites.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Website not found' });
  if (runningProcesses[req.params.id]) {
    runningProcesses[req.params.id].process.kill('SIGTERM');
    delete runningProcesses[req.params.id];
  }
  sites.splice(idx, 1);
  saveWebsites(sites);
  res.json({ ok: true });
});

// ── Start / Stop ──────────────────────────────────────────────────────────────

app.post('/api/websites/:id/start', async (req, res) => {
  const sites = loadWebsites();
  const site = sites.find(s => s.id === req.params.id);
  if (!site) return res.status(404).json({ error: 'Website not found' });
  if (runningProcesses[site.id]) return res.status(409).json({ error: 'Already running' });

  const portBusy = await isPortInUse(site.port);
  if (portBusy) {
    killByPort(site.port);
    await new Promise(r => setTimeout(r, 500));
  }

  const child = spawn(site.command, site.args, {
    cwd: site.path,
    detached: false,
    stdio: 'pipe',
    env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
  });

  runningProcesses[site.id] = { process: child, pid: child.pid };

  child.on('exit', (code) => {
    appendSiteLog(site.id, 'system', `Process exited with code ${code}`);
    delete runningProcesses[site.id];
  });

  child.stdout.on('data', d => appendSiteLog(site.id, 'stdout', d.toString()));
  child.stderr.on('data', d => appendSiteLog(site.id, 'stderr', d.toString()));

  appendSiteLog(site.id, 'system', `Started (PID ${child.pid})`);
  res.json({ ok: true, pid: child.pid });
});

app.post('/api/websites/:id/stop', async (req, res) => {
  const sites = loadWebsites();
  const site = sites.find(s => s.id === req.params.id);
  if (!site) return res.status(404).json({ error: 'Website not found' });
  const entry = runningProcesses[req.params.id];
  if (entry) {
    entry.process.kill('SIGTERM');
    delete runningProcesses[req.params.id];
  }
  killByPort(site.port);
  appendSiteLog(site.id, 'system', 'Stopped');
  res.json({ ok: true });
});

app.post('/api/websites/:id/rebuild', async (req, res) => {
  const sites = loadWebsites();
  const site = sites.find(s => s.id === req.params.id);
  if (!site) return res.status(404).json({ error: 'Website not found' });
  if (!site.build_command) return res.status(400).json({ error: 'No build_command configured' });

  appendSiteLog(site.id, 'system', `Rebuild started: ${site.build_command} ${(site.build_args || []).join(' ')}`);

  const child = spawn(site.build_command, site.build_args || [], {
    cwd: site.build_path || site.path,
    stdio: 'pipe',
    env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
  });

  child.stdout.on('data', d => appendSiteLog(site.id, 'stdout', d.toString()));
  child.stderr.on('data', d => appendSiteLog(site.id, 'stderr', d.toString()));

  child.on('close', (code) => {
    appendSiteLog(site.id, 'system', `Rebuild finished with exit code ${code}`);
    res.json({ ok: code === 0, exitCode: code });
  });

  child.on('error', (err) => {
    appendSiteLog(site.id, 'system', `Rebuild error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
});

// ── Per-site logs API ─────────────────────────────────────────────────────────

app.get('/api/websites/:id/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const entries = readSiteLog(req.params.id);
  res.json(entries.slice(-limit));
});

app.delete('/api/websites/:id/logs', (req, res) => {
  clearSiteLog(req.params.id);
  res.json({ ok: true });
});

app.get('/api/websites/:id/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const initial = readSiteLog(req.params.id).slice(-200);
  res.write(`data: ${JSON.stringify({ entries: initial, reset: true })}\n\n`);

  const file = siteLogFile(req.params.id);
  let lastSize = 0;
  try { lastSize = fs.statSync(file).size; } catch { /* file may not exist yet */ }

  const watcher = fs.watch(LOGS_DIR, (_, filename) => {
    if (filename !== `${req.params.id}.jsonl`) return;
    try {
      const stat = fs.statSync(file);
      if (stat.size <= lastSize) { lastSize = stat.size; return; }
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(stat.size - lastSize);
      fs.readSync(fd, buf, 0, buf.length, lastSize);
      fs.closeSync(fd);
      lastSize = stat.size;
      const newEntries = buf.toString('utf8').split('\n').filter(Boolean).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
      if (newEntries.length) res.write(`data: ${JSON.stringify({ entries: newEntries })}\n\n`);
    } catch { /* ignore */ }
  });

  req.on('close', () => watcher.close());
});

// ── Dashboard log API ─────────────────────────────────────────────────────────

app.get('/api/dashboard/logs', (_req, res) => {
  try {
    const content = readFileSync(DASHBOARD_LOG_FILE, 'utf8');
    const entries = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
    res.json(entries.slice(-200));
  } catch { res.json([]); }
});

app.delete('/api/dashboard/logs', (_req, res) => {
  try { fs.writeFileSync(DASHBOARD_LOG_FILE, ''); } catch { /* ignore */ }
  res.json({ ok: true });
});

app.get('/api/dashboard/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const content = readFileSync(DASHBOARD_LOG_FILE, 'utf8');
    const initial = content.split('\n').filter(Boolean).map(l => JSON.parse(l)).slice(-200);
    res.write(`data: ${JSON.stringify({ entries: initial, reset: true })}\n\n`);
  } catch { res.write(`data: ${JSON.stringify({ entries: [], reset: true })}\n\n`); }

  let lastSize = 0;
  try { lastSize = fs.statSync(DASHBOARD_LOG_FILE).size; } catch { /* ignore */ }

  const watcher = fs.watch(path.join(__dirname, 'logs'), (_, filename) => {
    if (filename !== 'dashboard.jsonl') return;
    try {
      const stat = fs.statSync(DASHBOARD_LOG_FILE);
      if (stat.size <= lastSize) { lastSize = stat.size; return; }
      const fd = fs.openSync(DASHBOARD_LOG_FILE, 'r');
      const buf = Buffer.alloc(stat.size - lastSize);
      fs.readSync(fd, buf, 0, buf.length, lastSize);
      fs.closeSync(fd);
      lastSize = stat.size;
      const newEntries = buf.toString('utf8').split('\n').filter(Boolean).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
      if (newEntries.length) res.write(`data: ${JSON.stringify({ entries: newEntries })}\n\n`);
    } catch { /* ignore */ }
  });

  req.on('close', () => watcher.close());
});

// ── Caddy API ─────────────────────────────────────────────────────────────────

const CADDY_BIN = '/opt/homebrew/bin/caddy';
const CADDYFILE_CANDIDATES = [
  path.join(process.env.HOME || '', '.config', 'caddy', 'Caddyfile'),
  '/opt/homebrew/etc/Caddyfile',
  '/etc/caddy/Caddyfile',
];

function findCaddyfile() {
  for (const p of CADDYFILE_CANDIDATES) {
    try { if (fs.statSync(p).isFile()) return p; } catch { /* skip */ }
  }
  return null;
}

let caddyProcess = null;

app.get('/api/caddy/status', async (_req, res) => {
  let running = false, version = null;
  try {
    const r = await fetch('http://localhost:2019/');
    if (r.ok) running = true;
  } catch { /* not running or admin disabled */ }
  if (!running) {
    try { execSync('pgrep -x caddy', { encoding: 'utf8' }); running = true; } catch { /* not running */ }
  }
  if (!running && caddyProcess) { caddyProcess = null; }
  try { version = execSync(`${CADDY_BIN} version`, { encoding: 'utf8' }).trim().split(' ')[0]; } catch { /* ignore */ }
  res.json({ running, version, caddyfile: findCaddyfile(), managedByDashboard: !!caddyProcess });
});

app.get('/api/caddy/config', (_req, res) => {
  const p = findCaddyfile();
  if (!p) return res.status(404).json({ error: 'Caddyfile not found' });
  try { res.json({ path: p, content: readFileSync(p, 'utf8') }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/caddy/config', (req, res) => {
  const p = findCaddyfile();
  if (!p) return res.status(404).json({ error: 'Caddyfile not found' });
  try { writeFileSync(p, req.body.content, 'utf8'); res.json({ ok: true, path: p }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/caddy/start', (_req, res) => {
  const p = findCaddyfile();
  if (!p) return res.status(404).json({ error: 'Caddyfile not found' });
  if (caddyProcess) return res.status(409).json({ error: 'Already running' });
  try {
    const child = spawn(CADDY_BIN, ['run', '--config', p], {
      detached: false,
      stdio: 'pipe',
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
    });
    caddyProcess = child;
    child.stdout.on('data', d => appendSiteLog('caddy', 'stdout', d.toString()));
    child.stderr.on('data', d => appendSiteLog('caddy', 'stderr', d.toString()));
    child.on('exit', code => { appendSiteLog('caddy', 'system', `Caddy exited with code ${code}`); caddyProcess = null; });
    appendSiteLog('caddy', 'system', `Started (PID ${child.pid})`);
    res.json({ ok: true, pid: child.pid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/caddy/stop', (_req, res) => {
  try {
    if (caddyProcess) { caddyProcess.kill('SIGTERM'); caddyProcess = null; }
    else { execSync('pkill -x caddy', { encoding: 'utf8' }); }
    appendSiteLog('caddy', 'system', 'Stopped');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/caddy/reload', (_req, res) => {
  const p = findCaddyfile();
  if (!p) return res.status(404).json({ error: 'Caddyfile not found' });
  try {
    const out = execSync(`${CADDY_BIN} reload --config ${p}`, {
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
    });
    appendSiteLog('caddy', 'system', 'Config reloaded');
    res.json({ ok: true, output: out });
  } catch (err) {
    appendSiteLog('caddy', 'stderr', err.message);
    res.status(500).json({ error: err.stderr || err.message });
  }
});

// Reuse site-log stream pattern with id='caddy'
app.get('/api/caddy/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const initial = readSiteLog('caddy').slice(-200);
  res.write(`data: ${JSON.stringify({ entries: initial, reset: true })}\n\n`);
  const file = siteLogFile('caddy');
  let lastSize = 0;
  try { lastSize = fs.statSync(file).size; } catch { /* ignore */ }
  const watcher = fs.watch(LOGS_DIR, (_, filename) => {
    if (filename !== 'caddy.jsonl') return;
    try {
      const stat = fs.statSync(file);
      if (stat.size <= lastSize) { lastSize = stat.size; return; }
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(stat.size - lastSize);
      fs.readSync(fd, buf, 0, buf.length, lastSize);
      fs.closeSync(fd);
      lastSize = stat.size;
      const newEntries = buf.toString('utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (newEntries.length) res.write(`data: ${JSON.stringify({ entries: newEntries })}\n\n`);
    } catch { /* ignore */ }
  });
  req.on('close', () => watcher.close());
});

app.delete('/api/caddy/logs', (_req, res) => {
  clearSiteLog('caddy');
  res.json({ ok: true });
});

// ── MacMini hardware API ──────────────────────────────────────────────────────

async function profiler(type) {
  try {
    const { stdout } = await execAsync(`system_profiler ${type} -json`, { timeout: 20000 });
    return JSON.parse(stdout)[type] || [];
  } catch { return []; }
}

function formatCores(str) {
  const m = (str || '').match(/proc\s+(\d+):(\d+):(\d+)/);
  return m ? `${m[1]}-core (${m[2]}P + ${m[3]}E)` : str;
}

async function getUSBViaIoreg() {
  const { stdout } = await execAsync('ioreg -p IOUSB -l -w 0', { timeout: 15000 });
  const devices = [];
  let cur = null;
  const SPEED = ['Low', 'Full', 'High', 'Full', 'SuperSpeed 5G', 'SuperSpeed+ 10G'];
  for (const line of stdout.split('\n')) {
    const nodeMatch = line.match(/^([\s|]*)\+-o\s+([^@]+)@/);
    if (nodeMatch) {
      if (cur) devices.push(cur);
      const isUsb = line.includes('IOUSBHostDevice') || line.includes('IOUSBDevice');
      cur = isUsb ? {
        name: nodeMatch[2].trim(), vendor: '', speed: '',
        depth: (nodeMatch[1].match(/\|/g) || []).length
      } : null;
      continue;
    }
    if (cur) {
      const p = line.match(/"kUSBProductString"\s*=\s*"(.+?)"/);
      if (p) cur.name = p[1];
      const v = line.match(/"kUSBVendorString"\s*=\s*"(.+?)"/);
      if (v) cur.vendor = v[1];
      const s = line.match(/"Device Speed"\s*=\s*(\d+)/);
      if (s) cur.speed = SPEED[+s[1]] || '';
    }
  }
  if (cur) devices.push(cur);
  const minD = devices.length ? Math.min(...devices.map(d => d.depth)) : 0;
  devices.forEach(d => d.depth -= minD);
  return devices;
}

app.get('/api/macmini', async (_req, res) => {
  const [hwRaw, netRaw, storRaw, usb, dispRaw] = await Promise.all([
    profiler('SPHardwareDataType'),
    profiler('SPNetworkDataType'),
    profiler('SPStorageDataType'),
    getUSBViaIoreg(),
    profiler('SPDisplaysDataType'),
  ]);

  const hw = hwRaw[0] || {};
  const hardware = {
    name: hw.machine_name || 'Unknown',
    model: hw.machine_model || '',
    chip: hw.chip_type || hw.cpu_type || '',
    cores: formatCores(hw.number_processors || ''),
    memory: hw.physical_memory || '',
    serial: hw.serial_number || '',
    bootRom: hw.boot_rom_version || '',
  };

  const network = netRaw.map(i => ({
    name: i._name || '',
    interface: i.interface || '',
    type: i.type || i.hardware || '',
    mac: i.Ethernet?.['MAC Address'] || '',
    ips: i.ip_address || [],
    ipv6: i.IPv6?.Addresses || [],
    speed: i.Ethernet?.MediaSubType || '',
    router: i.IPv4?.Router || '',
  }));

  const storage = storRaw
    .filter(v => v.mount_point === '/' || (v.mount_point && v.mount_point.startsWith('/Volumes/')))
    .map(v => ({
      name: v._name || '',
      mountPoint: v.mount_point || '',
      total: v.size_in_bytes || 0,
      free: v.free_space_in_bytes || 0,
      fileSystem: v.file_system || '',
      bsdName: v.bsd_name || '',
      mediumType: v.physical_drive?.medium_type || '',
      device: v.physical_drive?.device_name || '',
      isInternal: v.physical_drive?.is_internal_disk === 'yes',
      smart: v.physical_drive?.smart_status || '',
      protocol: v.physical_drive?.protocol || '',
    }));

  const displays = [];
  for (const gpu of dispRaw) {
    displays.push({ name: gpu._name || 'GPU', vram: gpu.spdisplays_vram || '', kind: 'gpu' });
    for (const d of gpu._items || []) {
      displays.push({ name: d._name || 'Display', resolution: d.spdisplays_resolution || '', connection: d.spdisplays_connection_type || '', kind: 'display' });
    }
  }

  res.json({ hardware, network, storage, usb, displays });
});

// ── Colima config ─────────────────────────────────────────────────────────────

const COLIMA_CONFIG = path.join(process.env.HOME, '.colima', 'default', 'colima.yaml');

app.get('/api/colima/config', (_req, res) => {
  try {
    const content = readFileSync(COLIMA_CONFIG, 'utf8');
    res.json({ content, path: COLIMA_CONFIG });
  } catch (e) {
    res.status(404).json({ error: `Cannot read ${COLIMA_CONFIG}: ${e.message}` });
  }
});

app.put('/api/colima/config', (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') return res.status(400).json({ error: 'Invalid content' });
    writeFileSync(COLIMA_CONFIG, content, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Directory browser ─────────────────────────────────────────────────────────

app.get('/api/browse', (req, res) => {
  const reqPath = req.query.path || '/Users/mac';
  const resolved = path.resolve(reqPath);
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ current: resolved, parent: path.dirname(resolved), dirs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Docker Containers API ─────────────────────────────────────────────────────

function dockerCmd(args) {
  return execSync(`docker ${args}`, {
    encoding: 'utf8',
    env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
  });
}

app.get('/api/containers', (_req, res) => {
  try {
    const raw = dockerCmd('ps -a --format "{{json .}}"');
    const list = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const result = list.map(c => {
      let ips = [], mounts = [];
      try {
        const inspect = JSON.parse(dockerCmd(`inspect ${c.ID}`))[0];
        const nets = inspect.NetworkSettings?.Networks || {};
        ips = Object.entries(nets)
          .map(([network, net]) => ({ network, ip: net.IPAddress || '' }))
          .filter(n => n.ip);
        mounts = (inspect.Mounts || []).map(m => ({
          type: m.Type, source: m.Source, destination: m.Destination,
        }));
      } catch { /* ignore */ }
      return {
        id: c.ID,
        name: c.Names.replace(/^\//, ''),
        image: c.Image,
        state: c.State,
        status: c.Status,
        size: c.Size,
        ports: c.Ports,
        networks: c.Networks,
        ips,
        mounts,
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/containers/:id/start', (req, res) => {
  try { dockerCmd(`start ${req.params.id}`); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/containers/:id/stop', (req, res) => {
  try { dockerCmd(`stop ${req.params.id}`); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/containers/:id/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const child = spawn('docker', ['logs', '-f', '--tail', '200', req.params.id], {
    stdio: 'pipe',
    env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
  });

  const send = (level, data) =>
    data.toString().split('\n').filter(Boolean).forEach(text =>
      res.write(`data: ${JSON.stringify({ level, text })}\n\n`)
    );

  child.stdout.on('data', d => send('stdout', d));
  child.stderr.on('data', d => send('stderr', d));
  child.on('close', () => { try { res.write(`data: ${JSON.stringify({ level: 'system', text: '— stream ended —' })}\n\n`); } catch { /* ignore */ } });
  req.on('close', () => child.kill());
});

// ── Auto-start ────────────────────────────────────────────────────────────────

async function autoStartSites() {
  const sites = loadWebsites();
  for (const site of sites.filter(s => s.autoStart)) {
    const busy = await isPortInUse(site.port);
    if (busy) {
      console.log(`[Dashboard] ${site.name} port ${site.port} already in use, skipping auto-start`);
      continue;
    }
    const child = spawn(site.command, site.args, {
      cwd: site.path,
      detached: false,
      stdio: 'pipe',
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
    });
    runningProcesses[site.id] = { process: child, pid: child.pid };
    child.on('exit', (code) => {
      appendSiteLog(site.id, 'system', `Process exited with code ${code}`);
      delete runningProcesses[site.id];
    });
    child.stdout.on('data', d => appendSiteLog(site.id, 'stdout', d.toString()));
    child.stderr.on('data', d => appendSiteLog(site.id, 'stderr', d.toString()));
    appendSiteLog(site.id, 'system', `Auto-started (PID ${child.pid})`);
    console.log(`[Dashboard] Auto-started ${site.name} (PID ${child.pid}) on port ${site.port}`);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('[Dashboard] Shutting down...');
  for (const [, entry] of Object.entries(runningProcesses)) entry.process.kill('SIGTERM');
  process.exit(0);
});

// ── HTTP server + WebSocket terminal ─────────────────────────────────────────

const httpServer = createHttpServer(app);
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const match = req.url.match(/^\/api\/containers\/([^/]+)\/terminal$/);
  if (match) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, match[1]));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, id) => {
  let shell;
  try {
    const dockerBin = execSync('which docker', { encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' } }).trim();
    shell = pty.spawn(dockerBin, ['exec', '-it', id, '/bin/sh'], {
      name: 'xterm-256color',
      cols: 80, rows: 24,
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' },
    });
  } catch (err) {
    ws.send(JSON.stringify({ type: 'data', data: `\r\nFailed to start: ${err.message}\r\n` }));
    ws.close();
    return;
  }

  shell.onData(data => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'data', data })); });
  shell.onExit(() => { if (ws.readyState === 1) ws.close(); });

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'data') shell.write(msg.data);
      else if (msg.type === 'resize') shell.resize(msg.cols, msg.rows);
    } catch { /* ignore */ }
  });

  ws.on('close', () => { try { shell.kill(); } catch { /* ignore */ } });
});

httpServer.listen(DASHBOARD_PORT, async () => {
  console.log(`[Dashboard] Running at http://localhost:${DASHBOARD_PORT}`);
  await autoStartSites();
});
