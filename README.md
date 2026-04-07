# Site Dashboard

A self-hosted server dashboard running on a Mac mini, built with Vue 3 + Vite frontend and a Node.js/Express backend.

![Site Dashboard](sitedashboard.jpg)

## Features

### Websites
- Monitor and manage hosted websites
- Per-site process start/stop
- Live log streaming (SSE) with save to disk

### Containers
- View all Docker containers (via Colima)
- Start/stop containers
- Live log streaming per container
- Interactive terminal via xterm.js (WebSocket + node-pty)
- Colima config editor with save and backup

### Caddy
- View Caddy running status
- Full-screen config file editor
- Start / stop / reload controls
- Live Caddy log streaming

### Mac Mini
- Hardware overview (chip, memory, serial)
- Network adapters (IP, MAC, speed, router)
- Disk usage with visual progress bars
- USB device tree (via `ioreg`, works on Apple M4)
- GPU / display info
- Auto-refresh every 15 seconds

### Dashboard Log
- Sidebar button streams the server's own console output in real time
- Save log to disk

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, Vite, @mdi/js |
| Backend | Node.js ESM, Express |
| Terminal | xterm.js, node-pty, WebSocket |
| Logs | SSE (Server-Sent Events), JSONL |
| Containers | Docker via Colima |
| Reverse proxy | Caddy |
| Hardware info | `system_profiler`, `ioreg` |

## Setup

```bash
# Install dependencies
npm install
cd frontend && npm install && npm run build && cd ..

# Start the server
node server.js
```

Server runs on **port 9000** by default.

## Project Structure

```
Site_Dashboard/
├── server.js              # Express + WebSocket server
├── config/
│   ├── pages.json         # Sidebar page definitions
│   └── websites.json      # Managed websites (gitignored)
├── frontend/
│   └── src/
│       ├── App.vue
│       ├── components/layout/Sidebar.vue
│       └── views/
│           ├── WebsitesPage.vue
│           ├── ContainersPage.vue
│           ├── CaddyPage.vue
│           └── MacMiniPage.vue
└── logs/                  # JSONL log files (gitignored)
```
