<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Client IPs</h1>
      <div class="header-actions">
        <span v-if="lastRefresh" class="last-refresh">Updated {{ lastRefresh }}</span>
        <button class="btn btn-refresh" :class="{ loading: refreshing }" @click="refresh" :disabled="refreshing">
          <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiRefresh" /></svg>
          {{ refreshing ? 'Refreshing…' : 'Refresh' }}
        </button>
        <button class="btn btn-settings" @click="settingsOpen = true">
          <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiCog" /></svg>
        </button>
      </div>
    </div>

    <div v-if="error" class="error-bar">{{ error }}</div>

    <div class="search-row">
      <input v-model="search" class="search-input" placeholder="Filter by hostname, IP or MAC…" />
      <span class="count">{{ filtered.length }} / {{ clients.length }}</span>
    </div>

    <div class="table-wrap">
      <table class="clients-table">
        <thead>
          <tr>
            <th>IP</th>
            <th>Hostname</th>
            <th>MAC</th>
            <th>Vendor</th>
            <th>Conn</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in filtered" :key="c.mac">
            <td class="cell-ip">{{ c.ip }}</td>
            <td class="cell-host">{{ c.hostname || '—' }}</td>
            <td class="cell-mac">{{ c.mac }}</td>
            <td class="cell-vendor">{{ c.vendor || '—' }}</td>
            <td class="cell-conn">
              <svg v-if="c.wired" viewBox="0 0 24 24" fill="currentColor" class="conn-icon conn-icon--eth" title="Wired"><path :d="mdiEthernet" /></svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor" class="conn-icon conn-icon--wifi" title="WiFi"><path :d="mdiWifi" /></svg>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="5" class="empty">{{ clients.length ? 'No matches.' : 'No clients — click Refresh to fetch from Unifi.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="table-footer">
      <button class="btn btn-save-file" @click="saveFile" :disabled="!clients.length">
        <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon"><path :d="mdiDownload" /></svg>
        Save as JSON
      </button>
    </div>

    <!-- Settings dialog -->
    <Teleport to="body">
      <div v-if="settingsOpen" class="overlay" @click.self="settingsOpen = false">
        <div class="dialog">
          <div class="dialog-header">
            <span class="dialog-title">Unifi Settings</span>
            <button class="close-btn" @click="settingsOpen = false">✕</button>
          </div>
          <div class="dialog-body">
            <label class="field-label">Controller URL</label>
            <input v-model="cfg.controller" class="field-input" placeholder="https://192.168.0.1" />
            <label class="field-label">API Key</label>
            <input v-model="cfg.apiKey" class="field-input" type="password" placeholder="••••••••••••••••••••••" />
            <label class="field-label">Site</label>
            <input v-model="cfg.site" class="field-input" placeholder="default" />
          </div>
          <div class="dialog-footer">
            <button class="btn btn-save" @click="saveConfig">Save</button>
            <button class="btn" @click="settingsOpen = false">Cancel</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { mdiRefresh, mdiCog, mdiEthernet, mdiWifi, mdiDownload } from '@mdi/js';

const clients    = ref([]);
const search     = ref('');
const refreshing = ref(false);
const error      = ref('');
const lastRefresh = ref('');
const settingsOpen = ref(false);
const cfg = ref({ controller: '', apiKey: '', site: 'default' });

const filtered = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return clients.value;
  return clients.value.filter(c =>
    c.ip.includes(q) || c.hostname.toLowerCase().includes(q) || c.mac.toLowerCase().includes(q)
  );
});

async function fetchClients() {
  const res = await fetch('/api/clients');
  clients.value = await res.json();
}

async function fetchConfig() {
  const res = await fetch('/api/clients/config');
  const data = await res.json();
  cfg.value = { controller: data.controller, apiKey: '', site: data.site };
}

async function refresh() {
  refreshing.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/clients/refresh', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { error.value = data.error || 'Refresh failed'; return; }
    await fetchClients();
    lastRefresh.value = new Date().toLocaleTimeString();
  } catch (e) {
    error.value = e.message;
  } finally {
    refreshing.value = false;
  }
}

async function saveConfig() {
  await fetch('/api/clients/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg.value),
  });
  settingsOpen.value = false;
}

function saveFile() {
  const blob = new Blob([JSON.stringify(clients.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'clientIPlist.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(() => { fetchClients(); fetchConfig(); });
</script>

<style scoped>
.page {
  padding: 2rem;
  max-width: 1100px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.last-refresh {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

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
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.btn:hover:not(:disabled) { background: var(--bg-card); color: var(--text-primary); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-icon { width: 14px; height: 14px; }

.btn-refresh.loading .btn-icon { animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.error-bar {
  background: var(--red-dim);
  color: var(--accent-red);
  border: 1px solid #4a1515;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  margin-bottom: 1rem;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.search-input {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.82rem;
  padding: 0.4rem 0.75rem;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus { border-color: var(--accent-blue); }
.search-input::placeholder { color: var(--text-secondary); }

.count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.table-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.clients-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.clients-table thead tr {
  border-bottom: 1px solid var(--border);
}

.clients-table th {
  padding: 0.6rem 1rem;
  text-align: left;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.clients-table td {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.clients-table tbody tr:last-child td { border-bottom: none; }
.clients-table tbody tr:hover td { background: var(--bg-sidebar); }

.cell-ip     { font-family: monospace; font-size: 0.8rem; white-space: nowrap; }
.cell-mac    { font-family: monospace; font-size: 0.76rem; color: var(--text-secondary); }
.cell-vendor { color: var(--text-secondary); }
.cell-conn   { width: 40px; }

.conn-icon { width: 14px; height: 14px; }
.conn-icon--wifi { color: var(--accent-blue); }
.conn-icon--eth  { color: var(--accent-green); }

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 3rem 0;
}

.table-footer {
  margin-top: 0.75rem;
  display: flex;
  justify-content: flex-end;
}

.btn-save-file {
  background: var(--bg-card);
  border-color: var(--border);
  color: var(--text-secondary);
}

/* Settings dialog */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 420px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}

.dialog-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}

.close-btn:hover { color: var(--text-primary); }

.dialog-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.field-input {
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.82rem;
  padding: 0.4rem 0.7rem;
  outline: none;
  width: 100%;
}

.field-input:focus { border-color: var(--accent-blue); }

.dialog-footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-save {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
  color: #fff;
}

.btn-save:hover { background: #2563eb; }
</style>
