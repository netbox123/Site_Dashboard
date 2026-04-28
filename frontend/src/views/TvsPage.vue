<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">TVs</h1>
    </div>

    <div class="tvs-grid">
      <div v-for="tv in tvs" :key="tv.id" class="tv-card">
        <div class="card-header">
          <div class="card-title-row">
            <span class="card-name">{{ tv.name }}</span>
            <span class="status-badge" :class="tv.online === true ? 'status-badge--online' : tv.online === false ? 'status-badge--offline' : 'status-badge--checking'">
              <span class="status-dot"></span>
              {{ tv.online === true ? 'Online' : tv.online === false ? 'Offline' : '…' }}
            </span>
          </div>
        </div>

        <div class="card-meta">
          <div class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiIp" /></svg>
            <span>{{ tv.ip_address }}</span>
          </div>
          <div v-if="tv.brand || tv.model" class="meta-row">
            <svg viewBox="0 0 24 24" fill="currentColor" class="meta-icon"><path :d="mdiTelevision" /></svg>
            <span>{{ [tv.brand, tv.model].filter(Boolean).join(' · ') }}</span>
          </div>
        </div>

        <div class="card-actions">
          <template v-if="pending.get(tv.id) === 'poweroff'">
            <span class="pending-label"><span class="spinner"></span>Powering off…</span>
          </template>
          <template v-else-if="pending.get(tv.id) === 'wake'">
            <span class="pending-label"><span class="spinner"></span>Waking up…</span>
          </template>
          <template v-else>
            <button v-if="tv.online === true" class="btn btn-stop" @click="poweroff(tv)">⏻ Power Off</button>
            <button v-if="tv.online === false && tv.mac" class="btn btn-start" @click="wake(tv)">▶ Wake</button>
            <span v-if="tv.online === false && !tv.mac" class="no-action">No MAC — can't wake</span>
            <button v-if="tv.online === true && tv.brand === 'philips'" class="btn btn-remote" @click="remoteFor = tv">📺 Remote</button>
          </template>
        </div>
      </div>

      <div v-if="!tvs.length" class="empty">No TVs configured yet.</div>
    </div>
  </div>

  <!-- ── Philips Remote modal ───────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="remoteFor" class="remote-overlay" @click.self="remoteFor = null">
      <div class="remote-wrap">

        <div class="remote-label">
          <span>{{ remoteFor.name }}</span>
          <button class="remote-close" @click="remoteFor = null">✕</button>
        </div>

        <div class="remote-shell">

          <!-- Brand -->
          <div class="r-brand">PHILIPS</div>

          <!-- Power -->
          <div class="r-center">
            <button class="rkey rkey--power" title="Power / Standby" @click="sendKey('Standby')">⏻</button>
          </div>

          <!-- Media: Previous / Play-Pause / Next -->
          <div class="r-row3">
            <button class="rkey" title="Previous"     @click="sendKey('Previous')">⏮</button>
            <button class="rkey" title="Play / Pause" @click="sendKey('Play')">⏯</button>
            <button class="rkey" title="Next"         @click="sendKey('Next')">⏭</button>
          </div>

          <!-- Media: Rewind / Stop / Fast Forward -->
          <div class="r-row3">
            <button class="rkey" title="Rewind"       @click="sendKey('Rewind')">⏪</button>
            <button class="rkey" title="Stop"         @click="sendKey('Stop')">⏹</button>
            <button class="rkey" title="Fast Forward" @click="sendKey('FastForward')">⏩</button>
          </div>

          <div class="r-divider"></div>

          <!-- TV Guide / Setup / Format -->
          <div class="r-row3">
            <button class="rkey rkey--fn" title="TV Guide" @click="sendKey('TVGuide')">GUIDE</button>
            <button class="rkey rkey--home" title="Home" @click="sendKey('Adjust')">⌂</button>
            <button class="rkey rkey--fn" title="Format"   @click="sendKey('Format')">FMT</button>
          </div>

          <!-- Sources ... Exit -->
          <div class="r-sidepair">
            <button class="rkey rkey--fn" title="Source / Inputs" @click="sendKey('Source')">SRC</button>
            <button class="rkey rkey--fn" title="Exit"            @click="sendKey('Exit')">EXIT</button>
          </div>

          <!-- Info ... Options -->
          <div class="r-sidepair">
            <button class="rkey" title="Info"    @click="sendKey('Info')">ℹ</button>
            <button class="rkey rkey--fn" title="Options" @click="sendKey('Options')">OPT</button>
          </div>

          <div class="r-divider"></div>

          <!-- D-pad -->
          <div class="r-dpad">
            <span></span>
            <button class="rkey r-arrow" @click="sendKey('CursorUp')">▲</button>
            <span></span>
            <button class="rkey r-arrow" @click="sendKey('CursorLeft')">◀</button>
            <button class="rkey r-ok"   @click="sendKey('Confirm')">OK</button>
            <button class="rkey r-arrow" @click="sendKey('CursorRight')">▶</button>
            <span></span>
            <button class="rkey r-arrow" @click="sendKey('CursorDown')">▼</button>
            <span></span>
          </div>

          <!-- Back / Home / List -->
          <div class="r-row3">
            <button class="rkey rkey--fn" title="Back" @click="sendKey('Back')">◁ BACK</button>
            <button class="rkey" title="Home" @click="sendKey('Home')">⌂</button>
            <button class="rkey rkey--fn" title="List" @click="sendKey('Options')">LIST</button>
          </div>

          <div class="r-divider"></div>

          <!-- Volume / Mute / Channel -->
          <div class="r-volch">
            <div class="r-vcol">
              <button class="rkey" title="Volume Up"   @click="sendKey('VolumeUp')">V+</button>
              <button class="rkey" title="Volume Down" @click="sendKey('VolumeDown')">V-</button>
            </div>
            <button class="rkey rkey--mute" title="Mute" @click="sendKey('Mute')">🔇</button>
            <div class="r-vcol">
              <button class="rkey" title="Channel Up"   @click="sendKey('ChannelStepUp')">C+</button>
              <button class="rkey" title="Channel Down" @click="sendKey('ChannelStepDown')">C-</button>
            </div>
          </div>

          <div class="r-divider"></div>

          <!-- Color buttons -->
          <div class="r-colors">
            <button class="rkey rkey--red"    @click="sendKey('RedColour')"></button>
            <button class="rkey rkey--green"  @click="sendKey('GreenColour')"></button>
            <button class="rkey rkey--yellow" @click="sendKey('YellowColour')"></button>
            <button class="rkey rkey--blue"   @click="sendKey('BlueColour')"></button>
          </div>

          <div class="r-divider"></div>

          <!-- Number pad -->
          <div class="r-numpad">
            <button class="rkey" @click="sendKey('Digit1')">1</button>
            <button class="rkey" @click="sendKey('Digit2')">2</button>
            <button class="rkey" @click="sendKey('Digit3')">3</button>
            <button class="rkey" @click="sendKey('Digit4')">4</button>
            <button class="rkey" @click="sendKey('Digit5')">5</button>
            <button class="rkey" @click="sendKey('Digit6')">6</button>
            <button class="rkey" @click="sendKey('Digit7')">7</button>
            <button class="rkey" @click="sendKey('Digit8')">8</button>
            <button class="rkey" @click="sendKey('Digit9')">9</button>
            <button class="rkey rkey--fn" title="Subtitles / CC" @click="sendKey('Subtitle')">CC</button>
            <button class="rkey" @click="sendKey('Digit0')">0</button>
            <button class="rkey rkey--fn" title="Teletext"       @click="sendKey('Text')">TXT</button>
          </div>

        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { mdiIp, mdiTelevision } from '@mdi/js';

const tvs       = ref([]);
const pending   = ref(new Map());
const remoteFor = ref(null);
let statusTimer     = null;
let fastStatusTimer = null;

async function loadConfig() {
  const res  = await fetch('/api/tvs');
  tvs.value  = await res.json();
}

async function refreshStatus() {
  const res      = await fetch('/api/tvs/status');
  const statuses = await res.json();
  const map      = Object.fromEntries(statuses.map(s => [s.id, s.online]));
  const p        = new Map(pending.value);
  tvs.value = tvs.value.map(tv => {
    const online = map[tv.id] ?? null;
    if (p.get(tv.id) === 'poweroff' && online === false) p.delete(tv.id);
    if (p.get(tv.id) === 'wake'     && online === true)  p.delete(tv.id);
    return { ...tv, online };
  });
  pending.value = p;
  if (!p.size && fastStatusTimer) { clearInterval(fastStatusTimer); fastStatusTimer = null; }
}

function startFastPoll() {
  if (fastStatusTimer) clearInterval(fastStatusTimer);
  fastStatusTimer = setInterval(refreshStatus, 2000);
}

async function poweroff(tv) {
  const p = new Map(pending.value); p.set(tv.id, 'poweroff'); pending.value = p;
  const res = await fetch(`/api/tvs/${tv.id}/poweroff`, { method: 'POST' });
  if (!res.ok) { const q = new Map(pending.value); q.delete(tv.id); pending.value = q; return; }
  startFastPoll();
}

async function wake(tv) {
  const p = new Map(pending.value); p.set(tv.id, 'wake'); pending.value = p;
  await fetch(`/api/tvs/${tv.id}/wake`, { method: 'POST' });
  startFastPoll();
}


async function sendKey(key) {
  if (!remoteFor.value) return;
  await fetch(`/api/tvs/${remoteFor.value.id}/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

function onKeydown(e) { if (e.key === 'Escape') remoteFor.value = null; }

onMounted(() => {
  loadConfig().then(refreshStatus);
  statusTimer = setInterval(refreshStatus, 10000);
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  clearInterval(statusTimer);
  if (fastStatusTimer) clearInterval(fastStatusTimer);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
/* ── Page layout ─────────────────────────────────────────────────────────────── */

.page { padding: 2rem; max-width: 1200px; }

.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
.page-title  { font-size: 1.2rem; font-weight: 600; color: var(--text-primary); }

/* ── TV cards ────────────────────────────────────────────────────────────────── */

.tvs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.tv-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: border-color 0.2s;
}

.tv-card:has(.status-badge--online) { border-color: #1e4a2a; }
.card-header { display: flex; flex-direction: column; gap: 0.2rem; }

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-name { font-size: 0.95rem; font-weight: 600; color: var(--text-primary); }

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

.status-badge--online    { background: var(--green-dim); color: var(--accent-green); }
.status-badge--offline   { background: var(--red-dim);   color: var(--accent-red); }
.status-badge--checking  { background: var(--bg-surface); color: var(--text-muted); }

.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
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

.meta-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--text-secondary); }
.meta-icon { width: 13px; height: 13px; flex-shrink: 0; opacity: 0.6; }

.card-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

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

.btn-start  { background: var(--green-dim); border-color: var(--green-dim); color: var(--accent-green); }
.btn-start:hover { background: #1a4a24; }
.btn-stop   { background: var(--red-dim);   border-color: var(--red-dim);   color: var(--accent-red); }
.btn-stop:hover  { background: #4a1515; }
.btn-remote { background: var(--blue-dim);  border-color: var(--blue-dim);  color: var(--accent-blue); }
.btn-remote:hover { background: #1e3a5f; }

.no-action { font-size: 0.75rem; color: var(--text-muted); }

.pending-label { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--text-secondary); }

.spinner {
  width: 11px; height: 11px;
  border: 2px solid var(--border);
  border-top-color: var(--text-secondary);
  border-radius: 50%;
  flex-shrink: 0;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.empty { grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 4rem 0; font-size: 0.9rem; }

/* ── Remote overlay ──────────────────────────────────────────────────────────── */

.remote-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.80);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remote-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  max-height: 95vh;
  overflow-y: auto;
  padding: 1rem;
  scrollbar-width: none;
}
.remote-wrap::-webkit-scrollbar { display: none; }

.remote-label {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.remote-close {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  line-height: 1;
}
.remote-close:hover { color: var(--text-primary); background: var(--bg-card); }

/* ── Remote shell (the physical body) ───────────────────────────────────────── */

.remote-shell {
  width: 216px;
  background: #18181c;
  border-radius: 28px 28px 22px 22px;
  padding: 16px 16px 22px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    inset 0 -2px 0 rgba(0,0,0,0.5),
    0 24px 64px rgba(0,0,0,0.9),
    0 0 0 1px #2a2a32;
}

/* ── Base button ─────────────────────────────────────────────────────────────── */

.rkey {
  background: #252528;
  border: 1px solid #38383e;
  border-bottom: 2px solid #111;
  border-radius: 8px;
  color: #bbb;
  font-size: 0.8rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  height: 34px;
  width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  user-select: none;
  transition: background 0.08s, color 0.08s;
}

.rkey:hover  { background: #2e2e34; color: #ddd; }
.rkey:active { background: #1a1a1e; border-bottom-width: 1px; transform: translateY(1px); color: #fff; }

/* ── Brand ───────────────────────────────────────────────────────────────────── */

.r-brand {
  text-align: center;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  color: #3a3a48;
  margin-bottom: -4px;
}

/* ── Power ───────────────────────────────────────────────────────────────────── */

.r-center { display: flex; justify-content: center; }

.rkey--power {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: #2a1015;
  border-color: #5c1a24;
  border-bottom-color: #1a080c;
  color: #e05060;
  font-size: 1.1rem;
}
.rkey--power:hover { background: #3a1520; color: #ff6070; }

/* ── 3-column row ────────────────────────────────────────────────────────────── */

.r-row3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.r-row3 .rkey { width: 100%; }

/* ── Divider ─────────────────────────────────────────────────────────────────── */

.r-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, #2e2e3a, transparent);
  margin: -1px 0;
}

/* ── Function / label buttons ────────────────────────────────────────────────── */

.rkey--fn {
  font-size: 0.58rem;
  letter-spacing: 0.04em;
  font-weight: 700;
  color: #999;
}

.rkey--home {
  font-size: 1.1rem;
  height: 46px;
  color: #ccc;
}

/* ── Side pair (left … right) ────────────────────────────────────────────────── */

.r-sidepair { display: flex; justify-content: space-between; align-items: center; }

/* ── Volume / Mute / Channel ─────────────────────────────────────────────────── */

.r-volch { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.r-vcol  { display: flex; flex-direction: column; gap: 6px; }

.rkey--mute {
  height: 74px;
  border-radius: 10px;
  font-size: 1rem;
}

/* ── D-pad ───────────────────────────────────────────────────────────────────── */

.r-dpad {
  display: grid;
  grid-template-columns: repeat(3, 44px);
  gap: 4px;
  justify-content: center;
  align-items: center;
}

.r-dpad span { display: block; height: 34px; }

.r-arrow { height: 34px; font-size: 0.65rem; }

.r-ok {
  width: 44px; height: 44px;
  border-radius: 50% !important;
  background: #1c2638;
  border-color: #2a5090;
  border-bottom-color: #0e1830;
  color: #5090d0;
  font-weight: 700;
  font-size: 0.72rem;
}
.r-ok:hover { background: #223348; color: #60a8e8; }

/* ── Color buttons ───────────────────────────────────────────────────────────── */

.r-colors { display: flex; justify-content: space-around; align-items: center; }

.rkey--red    { width: 34px; height: 16px; border-radius: 8px; background: #7a1515; border-color: #9a2020; border-bottom-color: #4a0c0c; font-size: 0; }
.rkey--green  { width: 34px; height: 16px; border-radius: 8px; background: #156015; border-color: #207820; border-bottom-color: #0c3a0c; font-size: 0; }
.rkey--yellow { width: 34px; height: 16px; border-radius: 8px; background: #706010; border-color: #887818; border-bottom-color: #403808; font-size: 0; }
.rkey--blue   { width: 34px; height: 16px; border-radius: 8px; background: #151578; border-color: #201898; border-bottom-color: #0c0c48; font-size: 0; }

.rkey--red:hover    { background: #9a1e1e; }
.rkey--green:hover  { background: #1e781e; }
.rkey--yellow:hover { background: #887818; }
.rkey--blue:hover   { background: #201898; }

/* ── Number pad ──────────────────────────────────────────────────────────────── */

.r-numpad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.r-numpad .rkey { width: 100%; }
</style>
