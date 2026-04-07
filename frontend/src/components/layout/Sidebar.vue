<template>
  <aside class="sidebar">
    <div class="sidebar-logo">
      <svg viewBox="0 0 24 24" fill="currentColor" class="logo-icon"><path :d="mdiViewDashboard" /></svg>
      <span class="logo-text">Dashboard</span>
      <button class="logo-log-btn" title="Dashboard Log" @click="openLog">
        <svg viewBox="0 0 24 24" fill="currentColor" class="logo-log-icon"><path :d="mdiTextBox" /></svg>
      </button>
    </div>

    <nav class="sidebar-nav">
      <button
        v-for="page in sortedPages"
        :key="page.slug"
        class="nav-item"
        :class="{ 'nav-item--active': activePage === page.slug }"
        @click="$emit('navigate', page.slug)"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="nav-icon">
          <path :d="ICON_MAP[page.icon] || mdiWeb" />
        </svg>
        <span>{{ page.name }}</span>
      </button>
    </nav>

    <!-- Dashboard Log Overlay -->
    <Teleport to="body">
      <div v-if="logOpen" class="log-overlay" @click.self="closeLog">
        <div class="log-dialog">
          <div class="log-dialog-header">
            <span class="log-dialog-title">Dashboard Log</span>
            <div class="log-dialog-actions">
              <button class="log-action-btn" title="Save log to disk" @click="saveLog">Save</button>
              <button class="log-action-btn" title="Clear log" @click="clearLog">Clear</button>
              <button class="log-close-btn" @click="closeLog">✕</button>
            </div>
          </div>
          <div class="log-body" ref="logBodyRef">
            <div v-if="!logEntries.length" class="log-empty">No log entries yet.</div>
            <div
              v-for="(entry, i) in logEntries"
              :key="i"
              class="log-entry"
              :class="`log-entry--${entry.level}`"
            >
              <span class="log-ts">{{ entry.ts }}</span>
              <span class="log-text">{{ entry.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { mdiViewDashboard, mdiWeb, mdiMonitor, mdiCog, mdiTextBox, mdiDocker, mdiServer, mdiDesktopTower } from '@mdi/js';

const ICON_MAP = { mdiViewDashboard, mdiWeb, mdiMonitor, mdiCog, mdiTextBox, mdiDocker, mdiServer, mdiDesktopTower };

const props = defineProps({
  pages: { type: Array, default: () => [] },
  activePage: { type: String, default: '' },
});

defineEmits(['navigate']);

const sortedPages = computed(() =>
  [...props.pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
);

// ── Dashboard log ────────────────────────────────────────────────────────────

const logOpen = ref(false);
const logEntries = ref([]);
const logBodyRef = ref(null);
let sseSource = null;

function scrollToBottom() {
  nextTick(() => {
    if (logBodyRef.value) logBodyRef.value.scrollTop = logBodyRef.value.scrollHeight;
  });
}

function openLog() {
  logOpen.value = true;
  logEntries.value = [];
  sseSource = new EventSource('/api/dashboard/logs/stream');
  sseSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.reset) {
      logEntries.value = data.entries;
    } else {
      logEntries.value.push(...data.entries);
    }
    scrollToBottom();
  };
}

function closeLog() {
  logOpen.value = false;
  if (sseSource) { sseSource.close(); sseSource = null; }
}

async function clearLog() {
  await fetch('/api/dashboard/logs', { method: 'DELETE' });
  logEntries.value = [];
}

function saveLog() {
  const text = logEntries.value.map(e => `${e.ts}  [${e.level}]  ${e.text}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dashboard_log.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<style scoped>
.sidebar {
  width: 200px;
  min-width: 200px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1.1rem 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}

.logo-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--accent-blue);
}

.logo-text {
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--text-primary);
  flex: 1;
}

.logo-log-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  border-radius: 4px;
  margin-left: auto;
  transition: color 0.15s, background 0.15s;
}

.logo-log-btn:hover {
  color: var(--text-primary);
  background: var(--bg-card);
}

.logo-log-icon {
  width: 15px;
  height: 15px;
}

.sidebar-nav {
  flex: 1;
  padding: 0.5rem 0;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.55rem 1rem;
  background: none;
  border: none;
  border-left: 3px solid transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  text-align: left;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.nav-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.nav-item--active {
  border-left-color: var(--accent-blue);
  background: var(--bg-card);
  color: var(--text-primary);
}

.nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* ── Log overlay ─────────────────────────────────────────────────────────── */

.log-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.log-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 700px;
  max-width: 95vw;
  max-height: 80vh;
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
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.log-dialog-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.log-action-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s, border-color 0.15s;
}

.log-action-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.log-close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  transition: color 0.15s;
}

.log-close-btn:hover {
  color: var(--text-primary);
}

.log-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
  font-family: monospace;
  font-size: 0.76rem;
  line-height: 1.5;
}

.log-empty {
  color: var(--text-secondary);
  text-align: center;
  padding: 2rem 0;
}

.log-entry {
  display: flex;
  gap: 0.75rem;
  padding: 0.1rem 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-ts {
  color: var(--text-secondary);
  flex-shrink: 0;
  font-size: 0.72rem;
}

.log-text {
  color: var(--text-primary);
}

.log-entry--stderr .log-text {
  color: #e87070;
}

.log-entry--system .log-text {
  color: var(--accent-blue);
}
</style>
