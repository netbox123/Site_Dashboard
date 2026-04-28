<template>
  <div class="print-root">

    <!-- Screen-only toolbar -->
    <div class="print-toolbar no-print">
      <span class="toolbar-title">{{ data?.site?.sitename || 'Network Report' }}</span>
      <button class="print-btn" @click="window.print()">🖨 Print / Save as PDF</button>
    </div>

    <div v-if="loading" class="print-loading no-print">Loading report data…</div>

    <div v-else-if="data" class="report">

      <!-- ── Cover page ─────────────────────────────────────────── -->
      <section class="print-page cover-page">
        <img v-if="data.site?.logo_url" :src="data.site.logo_url" class="cover-logo" alt="Logo" />
        <h1 class="cover-title">{{ data.site?.sitename }}</h1>
        <div class="cover-meta">
          <div v-if="data.site?.street">{{ data.site.street }}</div>
          <div v-if="data.site?.city">{{ data.site.city }}</div>
          <div v-if="data.site?.province">{{ data.site.province }}</div>
        </div>
        <div class="cover-contact">
          <div v-if="data.site?.name">{{ data.site.name }}</div>
          <div v-if="data.site?.tel">{{ data.site.tel }}</div>
          <div v-if="data.site?.email">{{ data.site.email }}</div>
        </div>
        <div class="cover-date">Generated {{ generatedAt }}</div>
        <div class="cover-pages">
          <div v-for="page in pageList" :key="page" class="cover-page-item">{{ page }}</div>
        </div>
      </section>

      <!-- ── Websites ───────────────────────────────────────────── -->
      <section class="print-page">
        <h2 class="section-title">Websites</h2>
        <table v-if="data.websites?.length" class="report-table">
          <thead>
            <tr><th>Name</th><th>Port</th><th>Command</th><th>Auto Start</th><th>Path</th></tr>
          </thead>
          <tbody>
            <tr v-for="w in data.websites" :key="w.id">
              <td class="td-name">{{ w.name }}</td>
              <td class="td-mono">{{ w.port }}</td>
              <td class="td-mono">{{ w.command }} {{ (w.args || []).join(' ') }}</td>
              <td>{{ w.autoStart ? 'Yes' : 'No' }}</td>
              <td class="td-path">{{ w.path }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No websites configured.</p>
      </section>

      <!-- ── Containers ─────────────────────────────────────────── -->
      <section class="print-page">
        <h2 class="section-title">Containers</h2>

        <!-- Colima VM config -->
        <h3 class="subsection-title">Colima VM</h3>
        <table v-if="data.colimaConfig" class="report-table report-table--kv colima-table">
          <tbody>
            <tr v-if="data.colimaConfig.cpu"><td class="kv-key">CPU</td><td>{{ data.colimaConfig.cpu }} cores</td></tr>
            <tr v-if="data.colimaConfig.memory"><td class="kv-key">Memory</td><td>{{ data.colimaConfig.memory }}</td></tr>
            <tr v-if="data.colimaConfig.disk"><td class="kv-key">Disk</td><td>{{ data.colimaConfig.disk }}</td></tr>
            <tr v-if="data.colimaConfig.arch"><td class="kv-key">Architecture</td><td class="td-mono">{{ data.colimaConfig.arch }}</td></tr>
            <tr v-if="data.colimaConfig.runtime"><td class="kv-key">Runtime</td><td>{{ data.colimaConfig.runtime }}</td></tr>
            <tr v-if="data.colimaConfig.vmType"><td class="kv-key">VM Type</td><td class="td-mono">{{ data.colimaConfig.vmType }}</td></tr>
            <tr v-if="data.colimaConfig.mounts?.length">
              <td class="kv-key">Mounts</td>
              <td><div v-for="m in data.colimaConfig.mounts" :key="m" class="td-mono">{{ m }}</div></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">Colima config not available.</p>

        <!-- Full config file -->
        <h3 class="subsection-title" style="margin-top:1.5rem">Config file
          <span v-if="data.colimaConfig?.filePath" class="subsection-path">{{ data.colimaConfig.filePath }}</span>
        </h3>
        <pre v-if="data.colimaConfig?.rawContent" class="code-block">{{ data.colimaConfig.rawContent }}</pre>

        <!-- Container list -->
        <h3 class="subsection-title" style="margin-top:1.5rem">Docker Containers</h3>
        <table v-if="data.containers?.length" class="report-table">
          <thead>
            <tr><th>Name</th><th>Image</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in data.containers" :key="c.name">
              <td class="td-name">{{ c.name }}</td>
              <td class="td-mono">{{ c.image }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No containers found.</p>
      </section>

      <!-- ── Caddy ──────────────────────────────────────────────── -->
      <section class="print-page">
        <h2 class="section-title">Caddy</h2>
        <h3 class="subsection-title">
          Config file
          <span v-if="data.caddy?.path" class="subsection-path">{{ data.caddy.path }}</span>
        </h3>
        <pre v-if="data.caddy?.content" class="code-block">{{ data.caddy.content }}</pre>
        <p v-else class="empty">Caddy config not available.</p>
      </section>

      <!-- ── Mac Mini ───────────────────────────────────────────── -->
      <section class="print-page" v-if="data.macmini">
        <h2 class="section-title">Mac Mini</h2>

        <!-- Machine -->
        <h3 class="subsection-title">Machine</h3>
        <table class="report-table report-table--kv mm-kv">
          <tbody>
            <tr v-if="data.macmini.hardware?.name"><td class="kv-key">Model</td><td><strong>{{ data.macmini.hardware.name }}</strong></td></tr>
            <tr v-if="data.macmini.hardware?.model"><td class="kv-key">Identifier</td><td class="td-mono">{{ data.macmini.hardware.model }}</td></tr>
            <tr v-if="data.macmini.hardware?.chip"><td class="kv-key">Chip</td><td>{{ data.macmini.hardware.chip }}</td></tr>
            <tr v-if="data.macmini.hardware?.cores"><td class="kv-key">Cores</td><td>{{ data.macmini.hardware.cores }}</td></tr>
            <tr v-if="data.macmini.hardware?.memory"><td class="kv-key">Memory</td><td>{{ data.macmini.hardware.memory }}</td></tr>
            <tr v-if="data.macmini.hardware?.serial"><td class="kv-key">Serial</td><td class="td-mono">{{ data.macmini.hardware.serial }}</td></tr>
            <tr v-if="data.macmini.hardware?.bootRom"><td class="kv-key">Boot ROM</td><td class="td-mono">{{ data.macmini.hardware.bootRom }}</td></tr>
            <template v-for="(d, i) in data.macmini.displays" :key="i">
              <tr><td class="kv-key">{{ d.kind === 'gpu' ? 'GPU' : 'Display' }}</td>
                <td>{{ d.name }}<span v-if="d.vram" class="mm-muted"> — {{ d.vram }}</span><span v-if="d.resolution" class="mm-muted"> — {{ d.resolution }}</span><span v-if="d.connection" class="mm-muted"> ({{ d.connection }})</span></td>
              </tr>
            </template>
          </tbody>
        </table>

        <!-- Network -->
        <h3 class="subsection-title" style="margin-top:1.5rem">Network Adapters</h3>
        <table class="report-table">
          <thead><tr><th>Interface</th><th>Name</th><th>MAC</th><th>IPv4</th><th>Router</th><th>Speed</th></tr></thead>
          <tbody>
            <tr v-for="iface in data.macmini.network" :key="iface.interface">
              <td class="td-mono">{{ iface.interface }}</td>
              <td class="td-name">{{ iface.name }}</td>
              <td class="td-mono">{{ iface.mac || '—' }}</td>
              <td class="td-mono">{{ iface.ips?.join(', ') || '—' }}</td>
              <td class="td-mono">{{ iface.router || '—' }}</td>
              <td>{{ iface.speed && iface.speed !== 'none' ? iface.speed : '—' }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Storage -->
        <h3 class="subsection-title" style="margin-top:1.5rem">Disks</h3>
        <table class="report-table">
          <thead><tr><th>Name</th><th>Mount</th><th>Type</th><th>FS</th><th>SMART</th><th>Used</th><th>Free</th><th>Total</th></tr></thead>
          <tbody>
            <tr v-for="vol in data.macmini.storage" :key="vol.mountPoint">
              <td class="td-name">{{ vol.name }}</td>
              <td class="td-mono">{{ vol.mountPoint }}</td>
              <td>{{ vol.mediumType?.toUpperCase() || '—' }}</td>
              <td>{{ vol.fileSystem || '—' }}</td>
              <td>{{ vol.smart || '—' }}</td>
              <td class="td-mono">{{ fmtBytes(vol.total - vol.free) }}</td>
              <td class="td-mono">{{ fmtBytes(vol.free) }}</td>
              <td class="td-mono">{{ fmtBytes(vol.total) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- USB -->
        <h3 class="subsection-title" style="margin-top:1.5rem">USB Devices</h3>
        <table class="report-table">
          <thead><tr><th>Device</th><th>Vendor</th><th>Speed</th></tr></thead>
          <tbody>
            <tr v-for="(dev, i) in data.macmini.usb" :key="i" :class="dev.depth === 0 ? 'usb-ctrl-row' : ''">
              <td class="td-name" :style="{ paddingLeft: `${dev.depth * 16 + 12}px` }">{{ dev.name }}</td>
              <td>{{ dev.vendor || '—' }}</td>
              <td>{{ dev.speed || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section class="print-page" v-else>
        <h2 class="section-title">Mac Mini</h2>
        <p class="empty">Mac Mini info not available.</p>
      </section>

      <!-- ── Machines ───────────────────────────────────────────── -->
      <section class="print-page">
        <h2 class="section-title">Machines</h2>
        <table v-if="data.machines?.length" class="report-table">
          <thead>
            <tr><th>Name</th><th>IP Address</th><th>MAC</th><th>OS</th><th>Connection</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in data.machines" :key="m.id">
              <td class="td-name">{{ m.name }}</td>
              <td class="td-mono">{{ m.ip_address }}</td>
              <td class="td-mono">{{ m.mac }}</td>
              <td>{{ m.os }}</td>
              <td>{{ (m.connection_types || []).join(', ') }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No machines configured.</p>
      </section>

      <!-- ── TVs ────────────────────────────────────────────────── -->
      <section class="print-page">
        <h2 class="section-title">TVs</h2>
        <table v-if="data.tvs?.length" class="report-table">
          <thead>
            <tr><th>Name</th><th>IP Address</th><th>MAC</th><th>Brand</th><th>Model</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in data.tvs" :key="t.id">
              <td class="td-name">{{ t.name }}</td>
              <td class="td-mono">{{ t.ip_address }}</td>
              <td class="td-mono">{{ t.mac }}</td>
              <td>{{ t.brand }}</td>
              <td>{{ t.model || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No TVs configured.</p>
      </section>

      <!-- ── Client IPs ─────────────────────────────────────────── -->
      <section class="print-page">
        <h2 class="section-title">Client IPs</h2>
        <table v-if="data.clients?.length" class="report-table">
          <thead>
            <tr><th>IP Address</th><th>Hostname</th><th>MAC</th><th>Vendor</th><th>Conn</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in data.clients" :key="c.mac">
              <td class="td-mono">{{ c.ip || '—' }}</td>
              <td class="td-name">{{ c.hostname || '—' }}</td>
              <td class="td-mono">{{ c.mac }}</td>
              <td>{{ c.vendor || '—' }}</td>
              <td>{{ c.wired ? 'Wired' : 'Wi-Fi' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No clients found.</p>
      </section>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const data     = ref(null);
const loading  = ref(true);
const generatedAt = ref('');
const window   = globalThis;

const pageList = ['Websites', 'Containers', 'Caddy', 'Mac Mini', 'Machines', 'TVs', 'Client IPs'];

function fmtBytes(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

onMounted(async () => {
  generatedAt.value = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  try {
    const res = await fetch('/api/report-data');
    data.value = await res.json();
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
/* ── Screen chrome ─────────────────────────────────────────────────────────── */

.print-root {
  background: #1a1a1a;
  min-height: 100vh;
}

.print-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 2rem;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.toolbar-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.print-btn {
  padding: 0.4rem 1rem;
  background: var(--accent-blue);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.print-btn:hover { opacity: 0.85; }

.print-loading {
  color: var(--text-secondary);
  padding: 4rem;
  text-align: center;
}

/* ── Report container (screen) ─────────────────────────────────────────────── */

.report {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* ── Each print page ───────────────────────────────────────────────────────── */

.print-page {
  background: #ffffff;
  color: #111;
  border-radius: 6px;
  padding: 3rem;
  min-height: 200px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
}

/* ── Cover page ────────────────────────────────────────────────────────────── */

.cover-page {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
  min-height: 500px;
}

.cover-logo {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.cover-title {
  font-size: 2rem;
  font-weight: 700;
  color: #111;
  margin: 0;
  border-bottom: 3px solid #2563eb;
  padding-bottom: 0.5rem;
}

.cover-meta {
  font-size: 0.95rem;
  color: #444;
  line-height: 1.7;
}

.cover-contact {
  font-size: 0.9rem;
  color: #555;
  line-height: 1.7;
}

.cover-date {
  font-size: 0.8rem;
  color: #888;
  margin-top: auto;
}

.cover-pages {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.cover-page-item {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.78rem;
  font-weight: 600;
}

/* ── Section heading ───────────────────────────────────────────────────────── */

.section-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #111;
  margin: 0 0 1.5rem 0;
  padding-bottom: 0.4rem;
  border-bottom: 2px solid #2563eb;
}

.subsection-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #333;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.75rem 0;
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.subsection-path {
  font-size: 0.72rem;
  font-family: monospace;
  font-weight: 400;
  color: #888;
  text-transform: none;
  letter-spacing: 0;
}

.colima-table { max-width: 420px; }
.mm-kv { max-width: 500px; }
.mm-muted { color: #888; }
.usb-ctrl-row td { font-weight: 600; background: #f1f5f9; }

/* ── Tables ────────────────────────────────────────────────────────────────── */

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  color: #222;
}

.report-table th {
  background: #f1f5f9;
  text-align: left;
  padding: 0.5rem 0.75rem;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #555;
  border-bottom: 2px solid #e2e8f0;
}

.report-table td {
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
}

.report-table tbody tr:last-child td { border-bottom: none; }
.report-table tbody tr:nth-child(even) td { background: #f8fafc; }

.report-table--kv .kv-key {
  font-weight: 600;
  color: #444;
  width: 140px;
}

.td-name  { font-weight: 500; }
.td-mono  { font-family: monospace; font-size: 0.78rem; }
.td-path  { font-family: monospace; font-size: 0.72rem; color: #555; word-break: break-all; }

/* ── Code block (Caddy) ────────────────────────────────────────────────────── */

.code-block {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 1rem;
  font-size: 0.72rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #222;
}

.empty {
  color: #888;
  font-style: italic;
  font-size: 0.85rem;
}

/* ── Print media ───────────────────────────────────────────────────────────── */

@media print {
  .no-print { display: none !important; }

  .print-root { background: white; }

  .report {
    display: block;
    padding: 0;
    gap: 0;
  }

  .print-page {
    box-shadow: none;
    border-radius: 0;
    padding: 2cm;
    page-break-before: always;
    break-before: page;
    page-break-after: always;
    break-after: page;
    min-height: 0;
  }

  .print-page:first-child {
    page-break-before: avoid;
    break-before: avoid;
  }

  .print-page:last-child {
    page-break-after: avoid;
    break-after: avoid;
  }

}
</style>
