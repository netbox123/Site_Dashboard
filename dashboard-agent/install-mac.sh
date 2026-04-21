#!/bin/bash
set -e

DASHBOARD_URL="${1:-http://192.168.0.20:9000}"
INSTALL_DIR="/usr/local/dashboard-agent"
PLIST_PATH="/Library/LaunchDaemons/com.dashboard.agent.plist"
NODE_BIN="$(which node 2>/dev/null || echo /usr/local/bin/node)"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo ./install-mac.sh [dashboard-url]"
  exit 1
fi

echo "→ Dashboard URL: $DASHBOARD_URL"
echo "→ Node: $NODE_BIN"
echo "→ Installing to $INSTALL_DIR"

mkdir -p "$INSTALL_DIR"
cp agent.js package.json "$INSTALL_DIR/"

echo "→ Installing dependencies"
cd "$INSTALL_DIR"
npm install --production --silent

echo "→ Writing launchd plist"
cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dashboard.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$INSTALL_DIR/agent.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DASHBOARD_URL</key>
    <string>$DASHBOARD_URL</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>/var/log/dashboard-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/dashboard-agent-error.log</string>
</dict>
</plist>
PLIST

# Unload existing service if present
launchctl unload "$PLIST_PATH" 2>/dev/null || true

echo "→ Loading service"
launchctl load "$PLIST_PATH"

echo ""
echo "✓ Agent installed and started"
echo "  Logs:  /var/log/dashboard-agent.log"
echo "  Error: /var/log/dashboard-agent-error.log"
echo ""
echo "  To uninstall:"
echo "    sudo launchctl unload $PLIST_PATH && sudo rm -rf $INSTALL_DIR $PLIST_PATH"
