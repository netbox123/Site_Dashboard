<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Websites</h1>
      <button class="btn btn-primary" @click="openAdd">+ Add</button>
    </div>

    <div class="sites-grid">
      <div v-for="site in sites" :key="site.id" class="site-card" :class="{ 'site-card--running': site.running }">

        <!-- Card header -->
        <div class="card-header">
          <div class="card-title-row">
            <span class="card-name">{{ site.name }}</span>
            <span class="status-badge" :class="site.running ? 'status-badge--running' : 'status-badge--stopped'">
              <span class="status-dot"></span>
              {{ site.running ? 'Running' : 'Stopped' }}
            </span>
          </div>
          <span class="card-id">{{ site.id }}</span>
        </div>

        <!-- Meta -->
        <div class="card-meta">
          <div class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiEthernet" /></svg>
            <span>port <code>{{ site.port }}</code></span>
          </div>
          <div class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiFolder" /></svg>
            <span class="meta-path">{{ site.path }}</span>
          </div>
          <div class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiConsole" /></svg>
            <span><code>{{ site.command }} {{ (site.args || []).join(' ') }}</code></span>
          </div>
        </div>

        <!-- Actions -->
        <div class="card-actions">
          <button v-if="!site.running" class="btn btn-start" @click="start(site.id)">▶ Start</button>
          <button v-else class="btn btn-stop" @click="stop(site.id)">■ Stop</button>
          <a v-if="site.running" :href="`http://${hostname}:${site.port}`" target="_blank" class="btn btn-open">
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiOpenInNew" /></svg>
            Open
          </a>
          <div class="card-actions-right">
            <label class="autostart-toggle" :title="site.autoStart ? 'Auto-start on' : 'Auto-start off'">
              <input type="checkbox" :checked="site.autoStart" @change="toggleAutoStart(site, $event.target.checked)" />
              <span class="toggle-slider"></span>
              <span class="toggle-label">Auto</span>
            </label>
          </div>
        </div>

        <!-- Log + Edit buttons -->
        <div class="card-log-row">
          <button class="btn btn-log" @click="openLogDialog(site)">
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiTextBoxOutline" /></svg>
            Logs
          </button>
          <button
            class="btn btn-log"
            :class="{ 'btn-rebuilding': rebuilding.has(site.id) }"
            :disabled="rebuilding.has(site.id)"
            :title="site.build_command ? 'Rebuild' : 'Configure build command in Edit'"
            @click="site.build_command ? rebuild(site) : openEdit(site)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon" :class="{ spinning: rebuilding.has(site.id) }"><path :d="mdiRefresh" /></svg>
            {{ rebuilding.has(site.id) ? 'Building…' : 'Rebuild' }}
          </button>
          <button class="btn btn-log btn-log--right" @click="openEdit(site)">
            <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiPencil" /></svg>
            Edit
          </button>
        </div>

      </div>

      <div v-if="!sites.length" class="empty">No websites configured yet.</div>
    </div>

    <!-- Edit / Add modal -->
    <div v-if="editModal.open" class="modal-backdrop" @click.self="editModal.open = false">
      <div class="modal">
        <h2 class="modal-title">{{ editModal.isNew ? 'Add Website' : 'Edit Website' }}</h2>
        <div class="modal-fields">
          <label class="field-label">ID <span class="field-hint">(unique slug)</span></label>
          <input class="field-input" v-model="editModal.fields.id" :disabled="!editModal.isNew" placeholder="my_app" />
          <label class="field-label">Name</label>
          <input class="field-input" v-model="editModal.fields.name" placeholder="My App" />
          <label class="field-label">Path</label>
          <div class="path-row">
            <input class="field-input" v-model="editModal.fields.path" placeholder="/Users/mac/Coding/MyApp" />
            <button class="btn" type="button" @click="openBrowser">Browse</button>
          </div>
          <div v-if="browser.open" class="dir-browser">
            <div class="dir-current">{{ browser.current }}</div>
            <div class="dir-list">
              <div class="dir-item dir-item--up" @click="browseTo(browser.parent)">↑ ..</div>
              <div v-for="dir in browser.dirs" :key="dir.path" class="dir-item" @click="browseTo(dir.path)">
                📁 {{ dir.name }}
              </div>
            </div>
            <button class="btn btn-select-dir" @click="selectDir">Use this folder</button>
          </div>
          <label class="field-label">Command</label>
          <input class="field-input" v-model="editModal.fields.command" placeholder="node" />
          <label class="field-label">Args <span class="field-hint">(space-separated)</span></label>
          <input class="field-input" v-model="editModal.fields.argsStr" placeholder="index.js" />
          <label class="field-label">Port</label>
          <input class="field-input field-input--short" v-model.number="editModal.fields.port" type="number" placeholder="3000" />
          <label class="field-label">Build command <span class="field-hint">(optional)</span></label>
          <input class="field-input" v-model="editModal.fields.build_command" placeholder="npm" />
          <label class="field-label">Build args <span class="field-hint">(space-separated)</span></label>
          <input class="field-input" v-model="editModal.fields.build_argsStr" placeholder="run build" />
          <label class="field-label">Auto-start</label>
          <label class="field-checkbox">
            <input type="checkbox" v-model="editModal.fields.autoStart" />
            <span>{{ editModal.fields.autoStart ? 'Yes' : 'No' }}</span>
          </label>
        </div>
        <p v-if="editModal.error" class="modal-error">{{ editModal.error }}</p>
        <div class="modal-actions">
          <button v-if="!editModal.isNew" class="btn btn-danger" @click="deleteSite(editModal.fields.id); editModal.open = false">Delete</button>
          <span v-else></span>
          <div class="modal-actions-right">
            <button class="btn" @click="editModal.open = false">Cancel</button>
            <button class="btn btn-primary" @click="saveEdit">{{ editModal.isNew ? 'Add' : 'Save' }}</button>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- Log dialog -->
  <Teleport to="body">
    <div v-if="logDialog.open" class="modal-backdrop" @click.self="closeLogDialog">
      <div class="log-dialog">
        <div class="log-dialog-header">
          <div class="log-dialog-title">
            <svg viewBox="0 0 24 24" fill="currentColor" class="log-dialog-icon"><path :d="mdiTextBoxOutline" /></svg>
            {{ logDialog.site?.name }} — Logs
          </div>
          <div class="log-dialog-actions">
            <button class="btn btn-clear-log" @click="saveLog(logDialog.site)">Save</button>
            <button class="btn btn-clear-log" @click="clearLog(logDialog.site.id)">Clear</button>
            <button class="btn btn-icon-only" @click="closeLogDialog">
              <svg viewBox="0 0 24 24" fill="currentColor"><path :d="mdiClose" /></svg>
            </button>
          </div>
        </div>
        <div class="log-dialog-output" ref="logDialogOutput">
          <div v-if="!logEntries[logDialog.site?.id]?.length" class="log-empty">No logs yet</div>
          <div
            v-for="(entry, i) in logEntries[logDialog.site?.id]"
            :key="i"
            class="log-line"
            :class="`log-line--${entry.level}`"
          >
            <span class="log-ts">{{ entry.ts.split(' ')[1] }}</span>
            <span class="log-text">{{ entry.text }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import {
  mdiEthernet, mdiFolder, mdiConsole, mdiOpenInNew,
  mdiPencil, mdiTextBoxOutline, mdiClose, mdiRefresh,
} from '@mdi/js';

// ── State ──────────────────────────────────────────────────────────────────────
const hostname   = window.location.hostname;
const sites      = ref([]);
const logEntries = reactive({});
const sseStreams  = {};
const rebuilding  = ref(new Set());
const logDialogOutput = ref(null);
const logDialog  = reactive({ open: false, site: null });
let pollTimer    = null;

// ── Edit modal ─────────────────────────────────────────────────────────────────
const editModal = reactive({
  open: false,
  isNew: false,
  error: '',
  fields: {},
});

// ── Directory browser ──────────────────────────────────────────────────────────
const browser = reactive({ open: false, current: '', parent: '', dirs: [] });

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchSites() {
  const res = await fetch('/api/websites');
  sites.value = await res.json();
}

onMounted(() => {
  fetchSites();
  pollTimer = setInterval(fetchSites, 5000);
});

onUnmounted(() => {
  clearInterval(pollTimer);
  for (const es of Object.values(sseStreams)) es.close();
});

// ── Log dialog ─────────────────────────────────────────────────────────────────
function openLogDialog(site) {
  logDialog.site = site;
  logDialog.open = true;
  startLogStream(site.id);
}

function closeLogDialog() {
  logDialog.open = false;
  const id = logDialog.site?.id;
  if (id && sseStreams[id]) { sseStreams[id].close(); delete sseStreams[id]; }
}

// ── Start / Stop ───────────────────────────────────────────────────────────────
async function start(id) {
  await fetch(`/api/websites/${id}/start`, { method: 'POST' });
  await fetchSites();
}

async function stop(id) {
  await fetch(`/api/websites/${id}/stop`, { method: 'POST' });
  await fetchSites();
}

// ── Rebuild ────────────────────────────────────────────────────────────────────
async function rebuild(site) {
  const s = new Set(rebuilding.value);
  s.add(site.id);
  rebuilding.value = s;
  openLogDialog(site);
  try {
    await fetch(`/api/websites/${site.id}/rebuild`, { method: 'POST' });
  } finally {
    const s2 = new Set(rebuilding.value);
    s2.delete(site.id);
    rebuilding.value = s2;
  }
}

// ── Auto-start toggle ──────────────────────────────────────────────────────────
async function toggleAutoStart(site, val) {
  await fetch(`/api/websites/${site.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoStart: val }),
  });
  await fetchSites();
}

// ── Delete ─────────────────────────────────────────────────────────────────────
async function deleteSite(id) {
  if (!confirm(`Delete "${id}"?`)) return;
  await fetch(`/api/websites/${id}`, { method: 'DELETE' });
  await fetchSites();
}

// ── Edit modal ─────────────────────────────────────────────────────────────────
function openAdd() {
  editModal.isNew = true;
  editModal.error = '';
  editModal.fields = { id: '', name: '', path: '', command: 'node', argsStr: 'index.js', port: 3000, autoStart: true, build_command: '', build_argsStr: '' };
  browser.open = false;
  editModal.open = true;
}

function openEdit(site) {
  editModal.isNew = false;
  editModal.error = '';
  editModal.fields = {
    id: site.id,
    name: site.name,
    path: site.path,
    command: site.command,
    argsStr: (site.args || []).join(' '),
    port: site.port,
    autoStart: site.autoStart,
    build_command: site.build_command || '',
    build_argsStr: (site.build_args || []).join(' '),
  };
  browser.open = false;
  editModal.open = true;
}

async function saveEdit() {
  editModal.error = '';
  const f = editModal.fields;
  if (!f.id || !f.name || !f.path || !f.command || !f.port) {
    editModal.error = 'All fields except Args are required.';
    return;
  }
  const body = {
    id: f.id,
    name: f.name,
    path: f.path,
    command: f.command,
    args: f.argsStr.trim() ? f.argsStr.trim().split(/\s+/) : [],
    port: Number(f.port),
    autoStart: f.autoStart,
    build_command: f.build_command.trim() || null,
    build_args: f.build_argsStr.trim() ? f.build_argsStr.trim().split(/\s+/) : [],
  };
  const res = editModal.isNew
    ? await fetch('/api/websites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    : await fetch(`/api/websites/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json();
    editModal.error = err.error || 'Failed to save.';
    return;
  }
  editModal.open = false;
  await fetchSites();
}

// ── Directory browser ──────────────────────────────────────────────────────────
async function openBrowser() {
  browser.open = !browser.open;
  if (browser.open) await browseTo(editModal.fields.path || '/Users/mac');
}

async function browseTo(p) {
  const res = await fetch(`/api/browse?path=${encodeURIComponent(p)}`);
  const data = await res.json();
  browser.current = data.current;
  browser.parent = data.parent;
  browser.dirs = data.dirs;
}

function selectDir() {
  editModal.fields.path = browser.current;
  browser.open = false;
}

// ── Log streaming ──────────────────────────────────────────────────────────────
function startLogStream(id) {
  if (sseStreams[id]) sseStreams[id].close();
  const es = new EventSource(`/api/websites/${id}/logs/stream`);
  sseStreams[id] = es;
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.reset) {
      logEntries[id] = msg.entries;
    } else {
      if (!logEntries[id]) logEntries[id] = [];
      logEntries[id].push(...msg.entries);
      if (logEntries[id].length > 500) logEntries[id] = logEntries[id].slice(-500);
    }
    setTimeout(() => {
      if (logDialogOutput.value) logDialogOutput.value.scrollTop = logDialogOutput.value.scrollHeight;
    }, 50);
  };
}

async function clearLog(id) {
  await fetch(`/api/websites/${id}/logs`, { method: 'DELETE' });
  logEntries[id] = [];
}

function saveLog(site) {
  const entries = logEntries[site.id] || [];
  const text = entries.map(e => `${e.ts}  [${e.level}]  ${e.text}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${site.id}_log.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
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

.page-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Grid */
.sites-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1rem;
}

/* Card */
.site-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  transition: border-color 0.2s;
}

.site-card--running { border-color: #1e4a2a; }

.card-header {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.card-id {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-family: monospace;
}

/* Status badge */
.status-badge {
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
}

.status-badge--running { background: var(--green-dim); color: var(--accent-green); }
.status-badge--stopped { background: var(--red-dim); color: var(--accent-red); }

.status-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.status-badge--running .status-dot { animation: pulse 1.5s infinite; }
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
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.meta-icon { width: 13px; height: 13px; flex-shrink: 0; opacity: 0.6; }

.meta-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 0.75rem;
}

.meta-row code {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--text-primary);
  background: var(--bg-base);
  padding: 1px 5px;
  border-radius: 3px;
}

/* Actions */
.card-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-actions-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
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
  text-decoration: none;
}

.btn:hover { background: var(--bg-card-hover); color: var(--text-primary); }

.btn-primary { background: var(--accent-blue); border-color: var(--accent-blue); color: #fff; }
.btn-primary:hover { background: #2563eb; border-color: #2563eb; color: #fff; }

.btn-start { background: var(--green-dim); border-color: var(--green-dim); color: var(--accent-green); }
.btn-start:hover { background: #1a4a24; }

.btn-stop { background: var(--red-dim); border-color: var(--red-dim); color: var(--accent-red); }
.btn-stop:hover { background: #4a1515; }

.btn-open { border-color: var(--blue-dim); color: var(--accent-blue); }
.btn-open:hover { background: var(--blue-dim); }

.btn-rebuild { color: var(--text-secondary); font-size: 0.78rem; }
.btn-rebuilding { opacity: 0.7; cursor: not-allowed; }
.spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.btn-icon { width: 14px; height: 14px; }

.btn-icon-only {
  padding: 0.35rem;
  aspect-ratio: 1;
}

.btn-icon-only svg { width: 15px; height: 15px; }

.btn-danger { color: var(--accent-red); border-color: transparent; }
.btn-danger:hover { background: var(--red-dim); border-color: var(--red-dim); }

/* Auto-start toggle */
.autostart-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.autostart-toggle input { display: none; }

.toggle-slider {
  position: relative;
  width: 30px; height: 17px;
  background: var(--border);
  border-radius: 999px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 11px; height: 11px;
  left: 3px; top: 3px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}

.autostart-toggle input:checked + .toggle-slider { background: var(--accent-blue); }
.autostart-toggle input:checked + .toggle-slider::before { transform: translateX(13px); }

/* Log button on card */
.card-log-row {
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
  display: flex;
  align-items: center;
}

.btn-log {
  color: var(--text-muted);
  border-color: transparent;
  font-size: 0.78rem;
  padding: 0.25rem 0.5rem;
}

.btn-log:hover { color: var(--text-secondary); background: var(--bg-base); }
.btn-log--right { margin-left: auto; }

/* Log dialog */
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

.btn-clear-log {
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
  gap: 0.6rem;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-ts { color: var(--text-muted); flex-shrink: 0; }
.log-line--stdout .log-text { color: #a8b8cc; }
.log-line--stderr .log-text { color: #f87171; }
.log-line--system .log-text { color: #60a5fa; }

/* Empty state */
.empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-muted);
  padding: 4rem 0;
  font-size: 0.9rem;
}

/* Modal */
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

.modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.75rem;
  width: 480px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 0.75rem;
  align-items: center;
}

.field-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.field-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.field-input {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-primary);
  font-size: 0.875rem;
  padding: 0.4rem 0.6rem;
  font-family: inherit;
  outline: none;
  width: 100%;
}

.field-input:focus { border-color: var(--accent-blue); }
.field-input--short { width: 100px; }

.field-checkbox {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  color: var(--text-primary);
  cursor: pointer;
}

.path-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.path-row .field-input { flex: 1; }

/* Dir browser */
.dir-browser {
  grid-column: 1 / -1;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.dir-current {
  font-size: 0.7rem;
  font-family: monospace;
  color: var(--text-muted);
  padding: 0.3rem 0.6rem;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dir-list {
  max-height: 160px;
  overflow-y: auto;
  padding: 0.25rem 0;
}

.dir-item {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--text-secondary);
  user-select: none;
}

.dir-item:hover { background: var(--border); color: var(--text-primary); }
.dir-item--up { color: var(--text-muted); font-style: italic; }

.btn-select-dir {
  margin: 0.4rem;
  font-size: 0.75rem;
  padding: 0.25rem 0.6rem;
}

.modal-error {
  font-size: 0.8rem;
  color: var(--accent-red);
}

.modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.25rem;
}

.modal-actions-right { display: flex; gap: 0.5rem; }
</style>
