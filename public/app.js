const grid = document.getElementById('sites-grid');
const modal = document.getElementById('modal-overlay');
const btnAdd = document.getElementById('btn-add');
const btnCancel = document.getElementById('btn-cancel');
const btnSave = document.getElementById('btn-save');

let sites = [];
let polling;

// --- API ---

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

async function loadSites() {
  try {
    sites = await api('/api/websites');
    render();
  } catch (e) {
    grid.innerHTML = `<p class="empty">Failed to load: ${e.message}</p>`;
  }
}

async function startSite(id) {
  setCardLoading(id, true);
  try {
    await api(`/api/websites/${id}/start`, { method: 'POST' });
  } catch (e) {
    alert(`Start failed: ${e.message}`);
  }
  await loadSites();
  setCardLoading(id, false);
}

async function stopSite(id) {
  setCardLoading(id, true);
  try {
    await api(`/api/websites/${id}/stop`, { method: 'POST' });
  } catch (e) {
    alert(`Stop failed: ${e.message}`);
  }
  await loadSites();
  setCardLoading(id, false);
}

async function removeSite(id, name) {
  if (!confirm(`Remove "${name}" from the dashboard?`)) return;
  try {
    await api(`/api/websites/${id}`, { method: 'DELETE' });
  } catch (e) {
    alert(`Remove failed: ${e.message}`);
  }
  await loadSites();
}

async function toggleAutoStart(id, value) {
  try {
    await api(`/api/websites/${id}`, { method: 'PATCH', body: { autoStart: value } });
  } catch (e) {
    alert(`Update failed: ${e.message}`);
    await loadSites();
  }
}

// --- Render ---

function setCardLoading(id, loading) {
  const card = document.querySelector(`[data-id="${id}"]`);
  if (!card) return;
  card.querySelectorAll('button').forEach(b => b.disabled = loading);
}

function render() {
  if (!sites.length) {
    grid.innerHTML = '<p class="empty">No websites configured. Click "+ Add Website" to add one.</p>';
    return;
  }

  grid.innerHTML = sites.map(site => {
    const running = site.running;
    const portLink = running
      ? `<a href="http://localhost:${site.port}" target="_blank" style="color:inherit">${site.port}</a>`
      : `${site.port}`;

    return `
    <div class="card ${running ? 'running' : 'stopped'}" data-id="${site.id}">
      <div class="card-header">
        <div>
          <div class="card-title">${esc(site.name)}</div>
          <div class="card-id">${esc(site.id)}</div>
        </div>
        <span class="status-badge ${running ? 'running' : 'stopped'}">
          <span class="status-dot"></span>
          ${running ? 'Running' : 'Stopped'}
        </span>
      </div>

      <div class="card-meta">
        <span>Port <code>${portLink}</code></span>
        <span>Cmd <code>${esc(site.command)} ${esc((site.args || []).join(' '))}</code></span>
        <span style="word-break:break-all">Path <code>${esc(site.path)}</code></span>
      </div>

      <div class="autostart-row">
        <label class="toggle">
          <input type="checkbox" ${site.autoStart ? 'checked' : ''}
            onchange="toggleAutoStart('${site.id}', this.checked)" />
          <span class="toggle-slider"></span>
        </label>
        Auto-start on boot
      </div>

      <div class="card-actions">
        ${running
          ? `<button class="btn btn-stop" onclick="stopSite('${site.id}')">Stop</button>`
          : `<button class="btn btn-start" onclick="startSite('${site.id}')">Start</button>`
        }
        <button class="btn" onclick="window.open('http://localhost:${site.port}','_blank')" ${running ? '' : 'disabled'}>Open</button>
        <button class="btn btn-danger" onclick="removeSite('${site.id}','${esc(site.name)}')">Remove</button>
      </div>
    </div>`;
  }).join('');
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Modal ---

// --- Directory browser ---

const dirBrowser = document.getElementById('dir-browser');
const dirCurrent = document.getElementById('dir-current');
const dirList = document.getElementById('dir-list');
const btnBrowse = document.getElementById('btn-browse');
const fPath = document.getElementById('f-path');

async function browseTo(p) {
  try {
    const data = await api(`/api/browse?path=${encodeURIComponent(p)}`);
    dirCurrent.textContent = data.current;
    dirList.innerHTML = '';

    // Up row
    if (data.current !== data.parent) {
      const li = document.createElement('li');
      li.className = 'up';
      li.innerHTML = '<span class="icon">↑</span> ..';
      li.addEventListener('click', () => browseTo(data.parent));
      dirList.appendChild(li);
    }

    // Select this folder
    const sel = document.createElement('li');
    sel.innerHTML = '<span class="icon">✓</span> <strong>Select this folder</strong>';
    sel.style.color = 'var(--blue)';
    sel.addEventListener('click', () => {
      fPath.value = data.current;
      dirBrowser.classList.add('hidden');
    });
    dirList.appendChild(sel);

    // Subdirectories
    for (const dir of data.dirs) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="icon">📁</span> ${esc(dir.name)}`;
      li.addEventListener('click', () => browseTo(dir.path));
      dirList.appendChild(li);
    }
  } catch (e) {
    dirCurrent.textContent = `Error: ${e.message}`;
    dirList.innerHTML = '';
  }
}

btnBrowse.addEventListener('click', () => {
  const start = fPath.value.trim() || '/Users/mac/Coding';
  dirBrowser.classList.remove('hidden');
  browseTo(start);
});

btnAdd.addEventListener('click', () => modal.classList.remove('hidden'));
btnCancel.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

function closeModal() {
  modal.classList.add('hidden');
  dirBrowser.classList.add('hidden');
  ['f-id','f-name','f-path','f-args','f-port'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-command').value = 'node';
  document.getElementById('f-autostart').checked = true;
}

btnSave.addEventListener('click', async () => {
  const body = {
    id: document.getElementById('f-id').value.trim(),
    name: document.getElementById('f-name').value.trim(),
    path: document.getElementById('f-path').value.trim(),
    command: document.getElementById('f-command').value.trim(),
    args: document.getElementById('f-args').value.trim().split(/\s+/).filter(Boolean),
    port: Number(document.getElementById('f-port').value),
    autoStart: document.getElementById('f-autostart').checked,
  };

  if (!body.id || !body.name || !body.path || !body.port) {
    alert('ID, Name, Path, and Port are required.');
    return;
  }

  btnSave.disabled = true;
  try {
    await api('/api/websites', { method: 'POST', body });
    closeModal();
    await loadSites();
  } catch (e) {
    alert(`Error: ${e.message}`);
  } finally {
    btnSave.disabled = false;
  }
});

// --- Log viewer ---

const logOutput = document.getElementById('log-output');
const logAutoScroll = document.getElementById('log-autoscroll');
const btnLogClear = document.getElementById('btn-log-clear');

function appendLog(text, reset = false) {
  if (reset) logOutput.textContent = '';
  if (!text) return;
  logOutput.textContent += text.endsWith('\n') ? text : text + '\n';
  if (logAutoScroll.checked) logOutput.scrollTop = logOutput.scrollHeight;
}

btnLogClear.addEventListener('click', () => { logOutput.textContent = ''; });

function connectLogStream() {
  const es = new EventSource('/api/logs/stream');
  es.onmessage = e => {
    const { text, reset } = JSON.parse(e.data);
    appendLog(text, reset);
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectLogStream, 3000); // reconnect on error
  };
}

connectLogStream();

// --- Init ---

loadSites();
polling = setInterval(loadSites, 5000); // refresh every 5s
