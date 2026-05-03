#!/bin/bash
set -e

# Ensure /data is writable by current user (host volume may override Dockerfile chown)
mkdir -p /data/chrome-profile
chmod 700 /data/chrome-profile 2>/dev/null || true

if [ "$MODE" = "debug" ]; then
  echo "Starting DEBUG mode (Xvfb + VNC + noVNC)..."

  # Virtual display
  Xvfb :99 -screen 0 1280x800x24 &
  XVFB_PID=$!
  export DISPLAY=:99

  # Wait for Xvfb to be ready
  for i in $(seq 1 10); do
    xdpyinfo -display :99 >/dev/null 2>&1 && break
    echo "Waiting for Xvfb... ($i)"
    sleep 1
  done

  fluxbox &

  # x11vnc — bind to localhost only
  if [ -n "$VNC_PASSWORD" ]; then
    mkdir -p /tmp/.vnc
    x11vnc -storepasswd "$VNC_PASSWORD" /tmp/.vnc/passwd
    x11vnc -display :99 -forever -usepw -rfbauth /tmp/.vnc/passwd \
      -listen 127.0.0.1 -rfbport 5900 -xkb -bg -o /tmp/x11vnc.log
  else
    echo "WARNING: VNC_PASSWORD not set — VNC is unauthenticated"
    x11vnc -display :99 -forever -nopw \
      -listen 127.0.0.1 -rfbport 5900 -xkb -bg -o /tmp/x11vnc.log
  fi

  # Wait for x11vnc to be ready
  sleep 2

  # noVNC — websockify bridges WebSocket (6080) → VNC TCP (5900)
  NOVNC_DIR=/usr/share/novnc
  websockify --web "$NOVNC_DIR" 0.0.0.0:6080 127.0.0.1:5900 &

  echo "noVNC ready at http://localhost:6080/vnc.html"
  [ -n "$NOVNC_PASSWORD" ] && echo "noVNC password: $NOVNC_PASSWORD"

  node app.js
else
  echo "Starting PROD mode (headless)..."
  node app.js
fi
