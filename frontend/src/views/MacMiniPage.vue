<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">Mac Mini</h1>
      <button class="btn-refresh" :class="{ spinning: loading }" title="Refresh" @click="load">
        <svg viewBox="0 0 24 24" fill="currentColor"><path :d="mdiRefresh" /></svg>
      </button>
    </div>

    <div v-if="loading && !data" class="loading">Loading hardware info…</div>
    <div v-else-if="error" class="error-banner">{{ error }}</div>

    <div v-else-if="data" class="hw-grid">

      <!-- Machine / Other hardware -->
      <div class="hw-card">
        <div class="hw-card-header">
          <svg viewBox="0 0 24 24" fill="currentColor" class="hw-card-icon"><path :d="mdiDesktopTower" /></svg>
          Machine
        </div>
        <div class="hw-card-body">
          <div class="hw-row hw-row--prominent">
            <span class="hw-label">Model</span>
            <span class="hw-value">{{ data.hardware.name }}</span>
          </div>
          <div class="hw-row">
            <span class="hw-label">Identifier</span>
            <span class="hw-value hw-mono">{{ data.hardware.model }}</span>
          </div>
          <div class="hw-row">
            <span class="hw-label">Chip</span>
            <span class="hw-value">{{ data.hardware.chip }}</span>
          </div>
          <div class="hw-row">
            <span class="hw-label">Cores</span>
            <span class="hw-value">{{ data.hardware.cores }}</span>
          </div>
          <div class="hw-row">
            <span class="hw-label">Memory</span>
            <span class="hw-value">{{ data.hardware.memory }}</span>
          </div>
          <div class="hw-row">
            <span class="hw-label">Serial</span>
            <span class="hw-value hw-mono hw-muted">{{ data.hardware.serial }}</span>
          </div>
          <div v-if="data.hardware.bootRom" class="hw-row">
            <span class="hw-label">Boot ROM</span>
            <span class="hw-value hw-mono hw-muted">{{ data.hardware.bootRom }}</span>
          </div>
          <!-- GPU/Display -->
          <template v-if="data.displays.length">
            <div class="hw-divider"></div>
            <div v-for="(d, i) in data.displays" :key="i" class="hw-row">
              <span class="hw-label">{{ d.kind === 'gpu' ? 'GPU' : 'Display' }}</span>
              <span class="hw-value">
                {{ d.name }}
                <span v-if="d.vram" class="hw-muted"> — {{ d.vram }}</span>
                <span v-if="d.resolution" class="hw-muted"> — {{ d.resolution }}</span>
                <span v-if="d.connection" class="hw-muted"> ({{ d.connection }})</span>
              </span>
            </div>
          </template>
        </div>
      </div>

      <!-- Network adapters -->
      <div class="hw-card">
        <div class="hw-card-header">
          <svg viewBox="0 0 24 24" fill="currentColor" class="hw-card-icon"><path :d="mdiLan" /></svg>
          Network Adapters
          <span class="hw-card-count">{{ data.network.length }}</span>
        </div>
        <div class="hw-card-body hw-scroll">
          <div v-for="iface in data.network" :key="iface.interface" class="iface-item" :class="{ 'iface-item--active': iface.ips.length }">
            <div class="iface-header">
              <span class="iface-dot" :class="iface.ips.length ? 'dot--active' : 'dot--inactive'"></span>
              <span class="iface-name">{{ iface.name }}</span>
              <span class="iface-id">{{ iface.interface }}</span>
              <span v-if="iface.speed && iface.speed !== 'none'" class="iface-speed">{{ iface.speed }}</span>
            </div>
            <div v-if="iface.mac" class="iface-detail">
              <span class="detail-label">MAC</span>
              <span class="detail-value hw-mono">{{ iface.mac }}</span>
            </div>
            <div v-for="ip in iface.ips" :key="ip" class="iface-detail">
              <span class="detail-label">IPv4</span>
              <span class="detail-value hw-mono ip--active">{{ ip }}</span>
            </div>
            <div v-for="ip in iface.ipv6.slice(0, 1)" :key="ip" class="iface-detail">
              <span class="detail-label">IPv6</span>
              <span class="detail-value hw-mono hw-muted">{{ ip }}</span>
            </div>
            <div v-if="iface.router" class="iface-detail">
              <span class="detail-label">Router</span>
              <span class="detail-value hw-mono hw-muted">{{ iface.router }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Disks -->
      <div class="hw-card">
        <div class="hw-card-header">
          <svg viewBox="0 0 24 24" fill="currentColor" class="hw-card-icon"><path :d="mdiHarddisk" /></svg>
          Disks
          <span class="hw-card-count">{{ data.storage.length }}</span>
        </div>
        <div class="hw-card-body hw-scroll">
          <div v-for="vol in data.storage" :key="vol.mountPoint" class="vol-item">
            <div class="vol-header">
              <span class="vol-name">{{ vol.name }}</span>
              <span class="vol-mount hw-mono">{{ vol.mountPoint }}</span>
            </div>
            <div class="vol-meta">
              <span v-if="vol.mediumType" class="vol-badge" :class="`vol-badge--${vol.mediumType}`">{{ vol.mediumType.toUpperCase() }}</span>
              <span v-if="vol.fileSystem" class="vol-badge">{{ vol.fileSystem }}</span>
              <span v-if="vol.smart" class="vol-badge" :class="vol.smart === 'Verified' ? 'vol-badge--ok' : 'vol-badge--warn'">{{ vol.smart }}</span>
              <span v-if="vol.isInternal" class="vol-badge">Internal</span>
            </div>
            <div class="vol-bar-wrap">
              <div class="vol-bar">
                <div class="vol-fill" :class="usageClass(vol)" :style="{ width: usedPct(vol) + '%' }"></div>
              </div>
              <span class="vol-pct">{{ usedPct(vol) }}%</span>
            </div>
            <div class="vol-sizes">
              <span>{{ fmtBytes(vol.total - vol.free) }} used</span>
              <span class="hw-muted">{{ fmtBytes(vol.free) }} free / {{ fmtBytes(vol.total) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- USB -->
      <div class="hw-card">
        <div class="hw-card-header">
          <svg viewBox="0 0 24 24" fill="currentColor" class="hw-card-icon"><path :d="mdiUsb" /></svg>
          USB Devices
          <span class="hw-card-count">{{ data.usb.length }}</span>
        </div>
        <div class="hw-card-body hw-scroll">
          <div v-if="!data.usb.length" class="hw-empty">No USB devices detected</div>
          <div
            v-for="(dev, i) in data.usb" :key="i"
            class="usb-item"
            :class="{ 'usb-controller': dev.depth === 0 }"
            :style="{ paddingLeft: `${dev.depth * 16 + 8}px` }"
          >
            <svg v-if="dev.depth > 0" viewBox="0 0 24 24" fill="currentColor" class="usb-icon"><path :d="mdiUsb" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor" class="usb-icon usb-icon--ctrl"><path :d="mdiCircleSmall" /></svg>
            <div class="usb-info">
              <span class="usb-name">{{ dev.name }}</span>
              <span v-if="dev.vendor" class="usb-mfr">{{ dev.vendor }}</span>
              <span v-if="dev.speed" class="usb-speed">{{ dev.speed }}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { mdiRefresh, mdiDesktopTower, mdiLan, mdiHarddisk, mdiUsb, mdiCircleSmall } from '@mdi/js';

const data    = ref(null);
const loading = ref(false);
const error   = ref('');
let pollTimer = null;

async function load() {
  loading.value = true;
  try {
    const res = await fetch('/api/macmini');
    if (!res.ok) throw new Error(await res.text());
    data.value = await res.json();
    error.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => { load(); pollTimer = setInterval(load, 15000); });
onUnmounted(() => clearInterval(pollTimer));

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

function usedPct(vol) {
  if (!vol.total) return 0;
  return Math.round((vol.total - vol.free) / vol.total * 100);
}

function usageClass(vol) {
  const p = usedPct(vol);
  if (p >= 90) return 'vol-fill--danger';
  if (p >= 70) return 'vol-fill--warn';
  return 'vol-fill--ok';
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

.btn-refresh {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.35rem;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  transition: color 0.15s, background 0.15s;
}
.btn-refresh svg { width: 16px; height: 16px; }
.btn-refresh:hover { color: var(--text-primary); background: var(--bg-card); }
.btn-refresh.spinning svg { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.loading { color: var(--text-muted); font-size: 0.9rem; padding: 2rem; }

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
.hw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(370px, 1fr));
  gap: 1rem;
}

/* Card */
.hw-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.hw-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}

.hw-card-icon { width: 16px; height: 16px; color: var(--accent-blue); flex-shrink: 0; }

.hw-card-count {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--text-muted);
  background: var(--bg-base);
  padding: 1px 7px;
  border-radius: 999px;
}

.hw-card-body {
  padding: 0.75rem 1rem;
  flex: 1;
}

.hw-scroll {
  max-height: 320px;
  overflow-y: auto;
}

.hw-empty {
  color: var(--text-muted);
  font-size: 0.82rem;
  text-align: center;
  padding: 1.5rem 0;
}

/* Machine rows */
.hw-row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.3rem 0;
  font-size: 0.82rem;
}

.hw-row--prominent .hw-value { font-size: 0.95rem; font-weight: 600; color: var(--text-primary); }

.hw-label {
  min-width: 80px;
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.hw-value { color: var(--text-secondary); }
.hw-mono  { font-family: monospace; font-size: 0.78rem; }
.hw-muted { color: var(--text-muted); }

.hw-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0.5rem 0;
}

/* Network */
.iface-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}
.iface-item:last-child { border-bottom: none; }

.iface-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
}

.iface-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot--active  { background: var(--accent-green); box-shadow: 0 0 4px var(--accent-green); }
.dot--inactive { background: var(--border); }

.iface-name {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-primary);
}

.iface-id {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--text-muted);
  background: var(--bg-base);
  padding: 1px 5px;
  border-radius: 3px;
}

.iface-speed {
  font-size: 0.7rem;
  color: var(--accent-blue);
  margin-left: auto;
}

.iface-detail {
  display: flex;
  gap: 0.5rem;
  padding: 0.05rem 1rem;
  font-size: 0.75rem;
}

.detail-label {
  min-width: 32px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.detail-value { color: var(--text-secondary); }
.ip--active { color: var(--accent-green); }

/* Storage */
.vol-item {
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--border);
}
.vol-item:last-child { border-bottom: none; }

.vol-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.vol-name {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
}

.vol-mount {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.vol-meta {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  margin-bottom: 0.4rem;
}

.vol-badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-base);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.vol-badge--ssd  { background: #1e2e50; color: var(--accent-blue); }
.vol-badge--hdd  { background: #2a2200; color: #d4a017; }
.vol-badge--ok   { background: var(--green-dim); color: var(--accent-green); }
.vol-badge--warn { background: var(--red-dim);   color: var(--accent-red); }

.vol-bar-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.vol-bar {
  flex: 1;
  height: 5px;
  background: var(--bg-base);
  border-radius: 999px;
  overflow: hidden;
}

.vol-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s;
}

.vol-fill--ok     { background: var(--accent-green); }
.vol-fill--warn   { background: #f59e0b; }
.vol-fill--danger { background: var(--accent-red); }

.vol-pct {
  font-size: 0.7rem;
  color: var(--text-muted);
  min-width: 28px;
  text-align: right;
}

.vol-sizes {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-secondary);
}

/* USB */
.usb-item {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--border);
}
.usb-item:last-child { border-bottom: none; }

.usb-controller { padding-top: 0.5rem; }
.usb-controller .usb-name { font-weight: 600; color: var(--text-primary); }

.usb-icon { width: 13px; height: 13px; flex-shrink: 0; color: var(--text-muted); margin-top: 1px; }
.usb-icon--ctrl { color: var(--accent-blue); width: 16px; height: 16px; }

.usb-info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: baseline;
}

.usb-name { font-size: 0.8rem; color: var(--text-secondary); }
.usb-mfr  { font-size: 0.72rem; color: var(--text-muted); }
.usb-speed { font-size: 0.7rem; color: var(--accent-blue); }
</style>
