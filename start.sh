#!/bin/bash
set -e

if [ "$MODE" = "debug" ]; then
  echo "Starting DEBUG mode (Xvfb + VNC)..."

  Xvfb :99 -screen 0 1280x800x24 &
  export DISPLAY=:99

  fluxbox &

  # Bind VNC to localhost only — tunnel via SSH if remote access is needed.
  # Set VNC_PASSWORD env var to require a password (recommended).
  if [ -n "$VNC_PASSWORD" ]; then
    mkdir -p /root/.vnc
    x11vnc -storepasswd "$VNC_PASSWORD" /root/.vnc/passwd
    x11vnc -display :99 -forever -usepw -listen 127.0.0.1 -xkb &
  else
    echo "WARNING: VNC_PASSWORD not set — VNC is unauthenticated (localhost only)"
    x11vnc -display :99 -forever -nopw -listen 127.0.0.1 -xkb &
  fi

  node app.js
else
  echo "Starting PROD mode (headless)..."
  node app.js
fi
