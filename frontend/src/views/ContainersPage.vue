<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Containers</h1>
      <div class="header-actions">
        <button class="btn btn-text-btn" title="Colima config" @click="openConfig">Config</button>
        <button class="btn btn-icon-btn" title="Refresh" @click="fetchContainers">
          <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon" :class="{ spinning: loading }"><path :d="mdiRefresh" /></svg>
        </button>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="containers-grid">
      <div
        v-for="c in containers" :key="c.id"
        class="container-card"
        :class="{ 'container-card--running': c.state === 'running' }"
      >
        <!-- Header -->
        <div class="card-header">
          <div class="card-title-row">
            <span class="card-name">{{ c.name }}</span>
            <span class="state-badge" :class="`state-badge--${c.state}`">
              <span class="state-dot"></span>{{ c.state }}
            </span>
          </div>
          <span class="card-image">{{ c.image }}</span>
        </div>

        <!-- Meta -->
        <div class="card-meta">
          <!-- Network / IP -->
          <div class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiLan" /></svg>
            <span v-if="c.ips.length">
              <span v-for="n in c.ips" :key="n.network">{{ n.ip }} <span class="meta-dim">({{ n.network }})</span></span>
            </span>
            <span v-else class="meta-dim">{{ c.networks }} mode</span>
          </div>
          <!-- Ports -->
          <div v-if="c.ports" class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiEthernet" /></svg>
            <span class="meta-ports">{{ c.ports }}</span>
          </div>
          <!-- Size -->
          <div class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiHarddisk" /></svg>
            <span>{{ c.size || '—' }}</span>
          </div>
          <!-- Mounts -->
          <div v-if="c.mounts.length" class="meta-row meta-row--mounts">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon meta-icon--top"><path :d="mdiFolderOpen" /></svg>
            <div class="mounts-list">
              <div
                v-for="(m, i) in c.mounts.slice(0, showAllMounts[c.id] ? undefined : 3)"
                :key="i"
                class="mount-item"
              >
                <span class="mount-src">{{ m.source }}</span>
                <span class="mount-arrow">→</span>
                <span class="mount-dst">{{ m.destination }}</span>
              </div>
              <button
                v-if="c.mounts.length > 3 && !showAllMounts[c.id]"
                class="mounts-more"
                @click="showAllMounts[c.id] = true"
              >+{{ c.mounts.length - 3 }} more…</button>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="card-actions">
          <button v-if="c.state !== 'running'" class="btn btn-start" :disabled="busy.has(c.id)" @click="start(c)">▶ Start</button>
          <button v-else class="btn btn-stop" :disabled="busy.has(c.id)" @click="stop(c)">■ Stop</button>
          <span class="card-status">{{ c.status }}</span>
        </div>

        <!-- Bottom row -->
        <div class="card-log-row">
          <button class="btn btn-log" @click="openLog(c)">
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiTextBoxOutline" /></svg>
            Logs
          </button>
          <button class="btn btn-log" :disabled="c.state !== 'running'" :title="c.state !== 'running' ? 'Container must be running' : 'Open terminal'" @click="openTerminal(c)">
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiConsole" /></svg>
            Terminal
          </button>
        </div>
      </div>

      <div v-if="!loading && !containers.length && !error" class="empty">No containers found.</div>
    </div>

    <!-- Log dialog -->
    <Teleport to="body">
      <div v-if="logDialog.open" class="modal-backdrop" @click.self="closeLog">
        <div class="log-dialog">
          <div class="log-dialog-header">
            <div class="log-dialog-title">
              <svg viewBox="0 0 24 24" fill="currentColor" class="log-dialog-icon"><path :d="mdiTextBoxOutline" /></svg>
              {{ logDialog.container?.name }} — Logs
            </div>
            <div class="log-dialog-actions">
              <button class="btn btn-log-action" @click="saveLog">Save</button>
              <button class="btn btn-icon-only" @click="closeLog">
                <svg viewBox="0 0 24 24" fill="currentColor"><path :d="mdiClose" /></svg>
              </button>
            </div>
          </div>
          <div class="log-dialog-output" ref="logOutputRef">
            <div v-if="!logLines.length" class="log-empty">No logs yet</div>
            <div
              v-for="(l, i) in logLines" :key="i"
              class="log-line" :class="`log-line--${l.level}`"
            ><span class="log-text">{{ l.text }}</span></div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Config dialog -->
    <Teleport to="body">
      <div v-if="configOpen" class="modal-backdrop" @click.self="configOpen = false">
        <div class="config-dialog">
          <div class="config-header">
            <svg viewBox="0 0 24 24" fill="currentColor" class="config-header-icon"><path :d="mdiCog" /></svg>
            <span>Colima Config</span>
            <span class="config-path">{{ configFilePath }}</span>
            <div class="config-header-actions">
              <span v-if="configSaveMsg" class="config-save-msg">{{ configSaveMsg }}</span>
              <button class="btn btn-log-action" :disabled="!!configError" @click="saveConfig">Save</button>
              <button class="btn btn-log-action" :disabled="!!configError" @click="backupConfig">Backup</button>
              <button class="btn btn-icon-only config-close" @click="configOpen = false">
                <svg viewBox="0 0 24 24" fill="currentColor"><path :d="mdiClose" /></svg>
              </button>
            </div>
          </div>
          <div class="config-body">
            <div v-if="configError" class="config-error">{{ configError }}</div>
            <textarea v-else class="config-content" v-model="configContent" spellcheck="false"></textarea>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Terminal dialog -->
    <Teleport to="body">
      <div v-if="termOpen" class="modal-backdrop" @click.self="closeTerminal">
        <div class="term-dialog">
          <div class="term-header">
            <svg viewBox="0 0 24 24" fill="currentColor" class="term-icon"><path :d="mdiConsole" /></svg>
            <span>{{ termContainer.name }} — Terminal</span>
            <button class="btn btn-icon-only term-close" @click="closeTerminal">
              <svg viewBox="0 0 24 24" fill="currentColor"><path :d="mdiClose" /></svg>
            </button>
          </div>
          <div ref="termRef" class="term-body"></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  mdiRefresh, mdiLan, mdiEthernet, mdiHarddisk, mdiFolderOpen,
  mdiTextBoxOutline, mdiConsole, mdiClose, mdiCog,
} from '@mdi/js';

// ── State ────────────────────────────────────────────────────────────────────
const containers   = ref([]);
const loading      = ref(false);
const error        = ref('');
const busy         = ref(new Set());
const showAllMounts = reactive({});
let pollTimer = null;

// ── Log dialog ────────────────────────────────────────────────────────────────
const logDialog  = reactive({ open: false, container: null });
const logLines   = ref([]);
const logOutputRef = ref(null);
let logSse = null;

// ── Colima config ─────────────────────────────────────────────────────────────
const configOpen     = ref(false);
const configContent  = ref('');
const configFilePath = ref('');
const configError    = ref('');
const configSaveMsg  = ref('');
let configSaveMsgTimer = null;

async function openConfig() {
  configContent.value = '';
  configError.value = '';
  configSaveMsg.value = '';
  configOpen.value = true;
  try {
    const res = await fetch('/api/colima/config');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load config');
    configContent.value = data.content;
    configFilePath.value = data.path;
  } catch (e) {
    configError.value = e.message;
  }
}

async function saveConfig() {
  try {
    const res = await fetch('/api/colima/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: configContent.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    showConfigMsg('Saved');
  } catch (e) {
    showConfigMsg('Error: ' + e.message);
  }
}

function backupConfig() {
  const blob = new Blob([configContent.value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `colima_backup_${new Date().toISOString().slice(0,10)}.yaml`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function showConfigMsg(msg) {
  configSaveMsg.value = msg;
  clearTimeout(configSaveMsgTimer);
  configSaveMsgTimer = setTimeout(() => { configSaveMsg.value = ''; }, 3000);
}

// ── Terminal ──────────────────────────────────────────────────────────────────
const termOpen      = ref(false);
const termContainer = reactive({ id: null, name: null });
const termRef       = ref(null);
let term = null, fitAddon = null, termWs = null, termRo = null;

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchContainers() {
  loading.value = true;
  try {
    const res = await fetch('/api/containers');
    if (!res.ok) throw new Error(await res.text());
    containers.value = await res.json();
    error.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => { fetchContainers(); pollTimer = setInterval(fetchContainers, 5000); });
onUnmounted(() => { clearInterval(pollTimer); closeLog(); closeTerminal(); });

// ── Start / Stop ──────────────────────────────────────────────────────────────
async function start(c) {
  const s = new Set(busy.value); s.add(c.id); busy.value = s;
  try { await fetch(`/api/containers/${c.id}/start`, { method: 'POST' }); }
  finally { const s2 = new Set(busy.value); s2.delete(c.id); busy.value = s2; await fetchContainers(); }
}

async function stop(c) {
  const s = new Set(busy.value); s.add(c.id); busy.value = s;
  try { await fetch(`/api/containers/${c.id}/stop`, { method: 'POST' }); }
  finally { const s2 = new Set(busy.value); s2.delete(c.id); busy.value = s2; await fetchContainers(); }
}

// ── Log dialog ────────────────────────────────────────────────────────────────
function openLog(c) {
  logDialog.container = c;
  logDialog.open = true;
  logLines.value = [];
  if (logSse) logSse.close();
  logSse = new EventSource(`/api/containers/${c.id}/logs/stream`);
  logSse.onmessage = e => {
    const d = JSON.parse(e.data);
    logLines.value.push(d);
    if (logLines.value.length > 500) logLines.value = logLines.value.slice(-500);
    nextTick(() => { if (logOutputRef.value) logOutputRef.value.scrollTop = logOutputRef.value.scrollHeight; });
  };
}

function closeLog() {
  logDialog.open = false;
  if (logSse) { logSse.close(); logSse = null; }
}

function saveLog() {
  const text = logLines.value.map(l => l.text).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${logDialog.container?.name}_log.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Terminal ──────────────────────────────────────────────────────────────────
function openTerminal(c) {
  termContainer.id = c.id;
  termContainer.name = c.name;
  termOpen.value = true;
}

function closeTerminal() {
  termOpen.value = false;
}

watch(termOpen, async (val) => {
  if (val) {
    await nextTick();
    initTerm();
  } else {
    destroyTerm();
  }
});

function initTerm() {
  term = new Terminal({
    theme: { background: '#090b10', foreground: '#c0cce0', cursor: '#60a5fa', selectionBackground: '#2a3a5a' },
    fontFamily: '"SF Mono", "Fira Mono", "Cascadia Code", monospace',
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    scrollback: 1000,
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(termRef.value);
  fitAddon.fit();

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  termWs = new WebSocket(`${proto}//${location.host}/api/containers/${termContainer.id}/terminal`);

  termWs.onopen  = () => termWs.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  termWs.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'data') term.write(m.data); };
  termWs.onerror = () => term.write('\r\n\x1b[31mWebSocket error\x1b[0m\r\n');
  termWs.onclose = () => term.write('\r\n\x1b[33m— disconnected —\x1b[0m\r\n');

  term.onData(d => { if (termWs?.readyState === 1) termWs.send(JSON.stringify({ type: 'data', data: d })); });
  term.onResize(({ cols, rows }) => { if (termWs?.readyState === 1) termWs.send(JSON.stringify({ type: 'resize', cols, rows })); });

  termRo = new ResizeObserver(() => fitAddon?.fit());
  termRo.observe(termRef.value);
}

function destroyTerm() {
  termRo?.disconnect(); termRo = null;
  try { termWs?.close(); } catch { /* ignore */ } termWs = null;
  term?.dispose(); term = null;
  fitAddon = null;
}
</script>

<style scoped>
.page {
  padding: 2rem;
  max-width: 1200px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.page-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-icon-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.35rem;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.btn-icon-btn:hover { color: var(--text-primary); background: var(--bg-card); }

.error-banner {
  background: var(--red-dim);
  color: var(--accent-red);
  border: 1px solid var(--accent-red);
  border-radius: 6px;
  padding: 0.6rem 1rem;
  font-size: 0.82rem;
  margin-bottom: 1rem;
}

/* Grid */
.containers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1rem;
}

/* Card */
.container-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  transition: border-color 0.2s;
}

.container-card--running { border-color: #1e4a2a; }

.card-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}

.card-image {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--text-muted);
  word-break: break-all;
}

/* State badge */
.state-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  flex-shrink: 0;
}

.state-badge--running  { background: var(--green-dim);  color: var(--accent-green); }
.state-badge--exited   { background: var(--red-dim);    color: var(--accent-red); }
.state-badge--paused   { background: #3a2a00;           color: #f59e0b; }
.state-badge--created  { background: var(--bg-base);    color: var(--text-muted); }
.state-badge--dead     { background: var(--red-dim);    color: var(--accent-red); }
.state-badge--restarting { background: #1e3050;         color: var(--accent-blue); }

.state-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.state-badge--running .state-dot { animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

/* Meta */
.card-meta {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.meta-row {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.meta-row--mounts { align-items: flex-start; }

.meta-icon { width: 13px; height: 13px; flex-shrink: 0; opacity: 0.6; margin-top: 1px; }
.meta-icon--top { margin-top: 2px; }

.meta-dim { color: var(--text-muted); }

.meta-ports {
  font-family: monospace;
  font-size: 0.72rem;
  word-break: break-all;
}

/* Mounts */
.mounts-list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}

.mount-item {
  display: flex;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-family: monospace;
  min-width: 0;
}

.mount-src, .mount-dst {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.mount-src { color: var(--text-muted); flex: 1; min-width: 0; }
.mount-dst { flex: 1; min-width: 0; }

.mount-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}

.mounts-more {
  background: none;
  border: none;
  color: var(--accent-blue);
  font-size: 0.72rem;
  cursor: pointer;
  padding: 0;
  text-align: left;
  font-family: inherit;
}

/* Actions */
.card-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-status {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-left: auto;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn:not(:disabled):hover { background: var(--bg-card-hover); color: var(--text-primary); }

.btn-start { background: var(--green-dim); border-color: var(--green-dim); color: var(--accent-green); }
.btn-start:not(:disabled):hover { background: #1a4a24; }

.btn-stop { background: var(--red-dim); border-color: var(--red-dim); color: var(--accent-red); }
.btn-stop:not(:disabled):hover { background: #4a1515; }

.btn-icon { width: 14px; height: 14px; }

.btn-icon-only {
  padding: 0.35rem;
}

.btn-icon-only svg { width: 15px; height: 15px; }

.spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Card bottom row */
.card-log-row {
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.btn-log {
  color: var(--text-muted);
  border-color: transparent;
  font-size: 0.78rem;
  padding: 0.25rem 0.5rem;
}

.btn-log:not(:disabled):hover { color: var(--text-secondary); background: var(--bg-base); }

/* Empty */
.empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-muted);
  padding: 4rem 0;
  font-size: 0.9rem;
}

/* Log dialog */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.log-dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  width: 700px;
  max-width: 95vw;
  height: 520px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.log-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.log-dialog-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.log-dialog-icon { width: 16px; height: 16px; color: var(--text-secondary); }
.log-dialog-actions { display: flex; align-items: center; gap: 0.4rem; }

.btn-log-action {
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
}

.log-dialog-output {
  flex: 1;
  background: #090b10;
  overflow-y: auto;
  padding: 0.75rem;
  font-family: 'SF Mono', 'Fira Mono', monospace;
  font-size: 0.72rem;
  line-height: 1.6;
}

.log-empty {
  color: var(--text-muted);
  text-align: center;
  padding: 2rem 0;
}

.log-line {
  display: flex;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line--stdout .log-text { color: #a8b8cc; }
.log-line--stderr .log-text { color: #f87171; }
.log-line--system .log-text { color: #60a5fa; }

/* Terminal dialog */
.term-dialog {
  background: #090b10;
  border: 1px solid var(--border);
  border-radius: 10px;
  width: min(980px, 95vw);
  height: min(640px, 90vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.term-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.term-icon { width: 16px; height: 16px; color: var(--accent-blue); flex-shrink: 0; }

.term-close { margin-left: auto; }

.term-body {
  flex: 1;
  padding: 0.5rem;
  overflow: hidden;
}

/* Config button */
.btn-text-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.8rem;
}
.btn-text-btn:hover { color: var(--text-primary); background: var(--bg-card); }

/* Config dialog */
.config-dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  width: min(860px, 95vw);
  height: min(88vh, 860px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.config-header-icon { width: 16px; height: 16px; color: var(--accent-blue); flex-shrink: 0; }

.config-path {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 0.25rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-header-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  flex-shrink: 0;
}

.config-save-msg {
  font-size: 0.75rem;
  color: var(--accent-green);
  font-weight: 400;
}

.config-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #090b10;
  overflow: hidden;
}

.config-content {
  flex: 1;
  margin: 0;
  padding: 1rem;
  font-family: 'SF Mono', 'Fira Mono', 'Cascadia Code', monospace;
  font-size: 0.78rem;
  line-height: 1.7;
  color: #c0cce0;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  white-space: pre;
  width: 100%;
  box-sizing: border-box;
}

.config-error {
  color: #f87171;
  padding: 2rem;
  font-size: 0.82rem;
}

/* xterm overrides */
:deep(.xterm) { height: 100%; }
:deep(.xterm-viewport) { border-radius: 0; }
</style>
