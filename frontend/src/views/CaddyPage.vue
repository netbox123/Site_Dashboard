<template>
  <div class="page">

    <div class="caddy-card">

      <!-- Header -->
      <div class="card-header">
        <div class="header-left">
          <svg viewBox="0 0 24 24" fill="currentColor" class="caddy-icon"><path :d="mdiServer" /></svg>
          <span class="card-title">Caddy</span>
          <span v-if="status.version" class="card-version">{{ status.version }}</span>
          <span class="state-badge" :class="status.running ? 'state-badge--running' : 'state-badge--stopped'">
            <span class="state-dot"></span>
            {{ status.running ? 'Running' : 'Stopped' }}
          </span>
        </div>
        <div class="header-right">
          <button v-if="!status.running" class="btn btn-start" :disabled="busy" @click="start">▶ Start</button>
          <button v-else class="btn btn-stop" :disabled="busy" @click="stop">■ Stop</button>
          <button class="btn" :disabled="busy || !status.running" @click="reload">
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon" :class="{ spinning: reloading }"><path :d="mdiRefresh" /></svg>
            Reload
          </button>
          <button class="btn btn-log" @click="openLog">
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiTextBoxOutline" /></svg>
            Logs
          </button>
        </div>
      </div>

      <!-- Status message -->
      <div v-if="statusMsg" class="status-msg" :class="statusMsg.type">{{ statusMsg.text }}</div>

      <!-- Config -->
      <div class="config-section">
        <div class="config-path">
          <svg viewBox="0 0 24 24" fill="currentColor" class="path-icon"><path :d="mdiFileDocument" /></svg>
          {{ status.caddyfile || 'Caddyfile not found' }}
          <span v-if="dirty" class="dirty-badge">unsaved</span>
        </div>
        <textarea
          class="config-editor"
          v-model="configContent"
          spellcheck="false"
          autocomplete="off"
          :disabled="!status.caddyfile"
          @input="dirty = true"
        ></textarea>
      </div>

      <!-- Footer actions -->
      <div class="card-footer">
        <button class="btn" :disabled="!dirty || busy" @click="save">Save</button>
        <button class="btn btn-primary" :disabled="!dirty || busy || !status.running" @click="saveAndReload">Save &amp; Reload</button>
        <button v-if="dirty" class="btn btn-discard" @click="discardChanges">Discard</button>
      </div>

    </div>

    <!-- Log dialog -->
    <Teleport to="body">
      <div v-if="logOpen" class="modal-backdrop" @click.self="closeLog">
        <div class="log-dialog">
          <div class="log-dialog-header">
            <div class="log-dialog-title">
              <svg viewBox="0 0 24 24" fill="currentColor" class="log-dialog-icon"><path :d="mdiTextBoxOutline" /></svg>
              Caddy — Logs
            </div>
            <div class="log-dialog-actions">
              <button class="btn btn-sm" @click="saveLogToDisk">Save</button>
              <button class="btn btn-sm" @click="clearLog">Clear</button>
              <button class="btn btn-icon-only" @click="closeLog">
                <svg viewBox="0 0 24 24" fill="currentColor"><path :d="mdiClose" /></svg>
              </button>
            </div>
          </div>
          <div class="log-output" ref="logOutputRef">
            <div v-if="!logEntries.length" class="log-empty">No log entries yet. Start Caddy from this dashboard to capture logs.</div>
            <div
              v-for="(e, i) in logEntries" :key="i"
              class="log-line" :class="`log-line--${e.level}`"
            >
              <span class="log-ts">{{ e.ts.split(' ')[1] }}</span>
              <span class="log-text">{{ e.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import { mdiServer, mdiRefresh, mdiTextBoxOutline, mdiFileDocument, mdiClose } from '@mdi/js';

// ── State ─────────────────────────────────────────────────────────────────────
const status        = reactive({ running: false, version: null, caddyfile: null, managedByDashboard: false });
const configContent = ref('');
const originalContent = ref('');
const dirty         = ref(false);
const busy          = ref(false);
const reloading     = ref(false);
const statusMsg     = ref(null);
let statusTimer = null, pollTimer = null;

// ── Log ───────────────────────────────────────────────────────────────────────
const logOpen      = ref(false);
const logEntries   = ref([]);
const logOutputRef = ref(null);
let logSse = null;

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  fetchStatus();
  fetchConfig();
  pollTimer = setInterval(fetchStatus, 4000);
});

onUnmounted(() => {
  clearInterval(pollTimer);
  closeLog();
});

async function fetchStatus() {
  const res = await fetch('/api/caddy/status');
  const data = await res.json();
  status.running = data.running;
  status.version = data.version;
  status.caddyfile = data.caddyfile;
  status.managedByDashboard = data.managedByDashboard;
}

async function fetchConfig() {
  const res = await fetch('/api/caddy/config');
  if (!res.ok) return;
  const data = await res.json();
  configContent.value = data.content;
  originalContent.value = data.content;
  dirty.value = false;
}

// ── Actions ───────────────────────────────────────────────────────────────────
function showMsg(type, text, ms = 3000) {
  statusMsg.value = { type, text };
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusMsg.value = null, ms);
}

async function start() {
  busy.value = true;
  try {
    const res = await fetch('/api/caddy/start', { method: 'POST' });
    const d = await res.json();
    if (!res.ok) showMsg('error', d.error);
    else { showMsg('success', `Started (PID ${d.pid})`); await fetchStatus(); }
  } finally { busy.value = false; }
}

async function stop() {
  busy.value = true;
  try {
    const res = await fetch('/api/caddy/stop', { method: 'POST' });
    const d = await res.json();
    if (!res.ok) showMsg('error', d.error);
    else { showMsg('success', 'Stopped'); await fetchStatus(); }
  } finally { busy.value = false; }
}

async function reload() {
  reloading.value = true;
  try {
    const res = await fetch('/api/caddy/reload', { method: 'POST' });
    const d = await res.json();
    if (!res.ok) showMsg('error', d.error || 'Reload failed');
    else showMsg('success', 'Config reloaded');
  } finally { reloading.value = false; }
}

async function save() {
  busy.value = true;
  try {
    const res = await fetch('/api/caddy/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: configContent.value }),
    });
    if (!res.ok) { const d = await res.json(); showMsg('error', d.error); return; }
    originalContent.value = configContent.value;
    dirty.value = false;
    showMsg('success', 'Saved');
  } finally { busy.value = false; }
}

async function saveAndReload() {
  await save();
  if (!dirty.value) await reload(); // only reload if save succeeded
}

function discardChanges() {
  configContent.value = originalContent.value;
  dirty.value = false;
}

// ── Log ───────────────────────────────────────────────────────────────────────
function openLog() {
  logOpen.value = true;
  logEntries.value = [];
  if (logSse) logSse.close();
  logSse = new EventSource('/api/caddy/logs/stream');
  logSse.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.reset) logEntries.value = d.entries;
    else logEntries.value.push(...d.entries);
    nextTick(() => { if (logOutputRef.value) logOutputRef.value.scrollTop = logOutputRef.value.scrollHeight; });
  };
}

function closeLog() {
  logOpen.value = false;
  if (logSse) { logSse.close(); logSse = null; }
}

async function clearLog() {
  await fetch('/api/caddy/logs', { method: 'DELETE' });
  logEntries.value = [];
}

function saveLogToDisk() {
  const text = logEntries.value.map(e => `${e.ts}  [${e.level}]  ${e.text}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'caddy_log.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 1.5rem;
  box-sizing: border-box;
}

/* Card */
.caddy-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  min-height: 0;
}

/* Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 1rem;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.caddy-icon {
  width: 18px;
  height: 18px;
  color: var(--accent-blue);
  flex-shrink: 0;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.card-version {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: monospace;
}

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
}

.state-badge--running { background: var(--green-dim); color: var(--accent-green); }
.state-badge--stopped { background: var(--red-dim);   color: var(--accent-red); }

.state-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.state-badge--running .state-dot { animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Status message */
.status-msg {
  padding: 0.4rem 1.25rem;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.status-msg.success { background: var(--green-dim); color: var(--accent-green); }
.status-msg.error   { background: var(--red-dim);   color: var(--accent-red); }

/* Config section */
.config-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0.75rem 1.25rem 0;
}

.config-path {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-family: monospace;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

.path-icon {
  width: 13px; height: 13px;
  opacity: 0.6;
  flex-shrink: 0;
}

.dirty-badge {
  font-size: 0.68rem;
  background: #3a2a00;
  color: #f59e0b;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: inherit;
  margin-left: 0.25rem;
}

.config-editor {
  flex: 1;
  width: 100%;
  resize: none;
  background: #090b10;
  color: #c0cce0;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: 'SF Mono', 'Fira Mono', 'Cascadia Code', monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  padding: 0.75rem 1rem;
  outline: none;
  tab-size: 4;
  box-sizing: border-box;
  min-height: 0;
}

.config-editor:focus {
  border-color: var(--accent-blue);
}

.config-editor:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Footer */
.card-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
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

.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn:not(:disabled):hover { background: var(--bg-card-hover); color: var(--text-primary); }

.btn-primary { background: var(--accent-blue); border-color: var(--accent-blue); color: #fff; }
.btn-primary:not(:disabled):hover { background: #2563eb; border-color: #2563eb; }

.btn-start { background: var(--green-dim); border-color: var(--green-dim); color: var(--accent-green); }
.btn-start:not(:disabled):hover { background: #1a4a24; }

.btn-stop { background: var(--red-dim); border-color: var(--red-dim); color: var(--accent-red); }
.btn-stop:not(:disabled):hover { background: #4a1515; }

.btn-discard { color: var(--accent-red); border-color: transparent; }
.btn-discard:not(:disabled):hover { background: var(--red-dim); border-color: var(--red-dim); }

.btn-log { color: var(--text-muted); border-color: transparent; }
.btn-log:not(:disabled):hover { color: var(--text-secondary); background: var(--bg-base); }

.btn-icon { width: 14px; height: 14px; }
.btn-icon-only { padding: 0.35rem; }
.btn-icon-only svg { width: 15px; height: 15px; }

.btn-sm { padding: 0.2rem 0.5rem; font-size: 0.75rem; }

.spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

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

.log-output {
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
  padding: 3rem 1rem;
  line-height: 1.8;
}

.log-line {
  display: flex;
  gap: 0.6rem;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-ts { color: var(--text-muted); flex-shrink: 0; }
.log-line--stdout .log-text { color: #a8b8cc; }
.log-line--stderr .log-text { color: #f87171; }
.log-line--system .log-text { color: #60a5fa; }
</style>
