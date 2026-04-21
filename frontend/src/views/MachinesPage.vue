<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Machines</h1>
    </div>

    <div class="machines-grid">
      <div v-for="machine in machines" :key="machine.id" class="machine-card">
        <div class="card-header">
          <div class="card-title-row">
            <span class="card-name">{{ machine.name }}</span>
            <span class="status-badge" :class="machine.online ? 'status-badge--online' : 'status-badge--offline'">
              <span class="status-dot"></span>
              {{ machine.online ? 'Online' : 'Offline' }}
            </span>
          </div>
        </div>

        <div class="card-meta">
          <div class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiIp" /></svg>
            <span>{{ machine.ip_address }}</span>
          </div>
          <div class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiMonitor" /></svg>
            <span>{{ machine.os }}</span>
          </div>
          <div v-if="machine.mac" class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiEthernet" /></svg>
            <span class="meta-mac">{{ machine.mac }}</span>
          </div>
        </div>

        <div class="card-actions">
          <button
            v-if="machine.online"
            class="btn btn-stop"
            :disabled="busy.has(machine.id)"
            @click="shutdown(machine)"
          >■ Shutdown</button>
          <button
            v-if="!machine.online && machine.mac"
            class="btn btn-start"
            :disabled="busy.has(machine.id)"
            @click="wake(machine)"
          >▶ Wake</button>
          <span v-if="!machine.online && !machine.mac" class="no-action">No MAC — can't wake</span>
        </div>
      </div>

      <div v-if="!machines.length" class="empty">No machines configured yet.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { mdiIp, mdiMonitor, mdiEthernet } from '@mdi/js';

const machines = ref([]);
const busy = ref(new Set());
let pollTimer = null;

async function fetchMachines() {
  const res = await fetch('/api/machines');
  machines.value = await res.json();
}

async function shutdown(machine) {
  const s = new Set(busy.value); s.add(machine.id); busy.value = s;
  try { await fetch(`/api/machines/${machine.id}/shutdown`, { method: 'POST' }); }
  finally { const s2 = new Set(busy.value); s2.delete(machine.id); busy.value = s2; }
  await fetchMachines();
}

async function wake(machine) {
  const s = new Set(busy.value); s.add(machine.id); busy.value = s;
  try { await fetch(`/api/machines/${machine.id}/wake`, { method: 'POST' }); }
  finally { const s2 = new Set(busy.value); s2.delete(machine.id); busy.value = s2; }
}

onMounted(() => {
  fetchMachines();
  pollTimer = setInterval(fetchMachines, 10000);
});

onUnmounted(() => clearInterval(pollTimer));
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

.machines-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.machine-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: border-color 0.2s;
}

.machine-card:has(.status-badge--online) { border-color: #1e4a2a; }

.card-header { display: flex; flex-direction: column; gap: 0.2rem; }

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

.status-badge--online  { background: var(--green-dim); color: var(--accent-green); }
.status-badge--offline { background: var(--red-dim);   color: var(--accent-red); }

.status-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.status-badge--online .status-dot { animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

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

.meta-mac { font-family: monospace; font-size: 0.72rem; }

.card-actions { display: flex; align-items: center; gap: 0.5rem; }

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

.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-start { background: var(--green-dim); border-color: var(--green-dim); color: var(--accent-green); }
.btn-start:hover:not(:disabled) { background: #1a4a24; }

.btn-stop { background: var(--red-dim); border-color: var(--red-dim); color: var(--accent-red); }
.btn-stop:hover:not(:disabled) { background: #4a1515; }

.no-action { font-size: 0.75rem; color: var(--text-muted); }

.empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-muted);
  padding: 4rem 0;
  font-size: 0.9rem;
}
</style>
