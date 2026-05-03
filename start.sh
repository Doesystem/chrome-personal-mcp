#!/bin/bash
set -e

if [ "$MODE" = "debug" ]; then
  echo "Starting DEBUG mode (Xvfb + VNC + noVNC)..."

  # Virtual display
  Xvfb :99 -screen 0 1280x800x24 &
  export DISPLAY=:99

  fluxbox &

  # x11vnc — bind to localhost only, VNC clients connect on port 5900
  if [ -n "$VNC_PASSWORD" ]; then
    mkdir -p /tmp/.vnc
    x11vnc -storepasswd "$VNC_PASSWORD" /tmp/.vnc/passwd
    x11vnc -display :99 -forever -usepw -rfbauth /tmp/.vnc/passwd -listen 127.0.0.1 -rfbport 5900 -xkb &
  else
    echo "WARNING: VNC_PASSWORD not set — VNC is unauthenticated"
    x11vnc -display :99 -forever -nopw -listen 127.0.0.1 -rfbport 5900 -xkb &
  fi

  # Wait for x11vnc to be ready
  sleep 1

  # noVNC — websockify bridges WebSocket (6080) → VNC TCP (5900)
  # noVNC web UI is served from /usr/share/novnc
  NOVNC_DIR=/usr/share/novnc

  if [ -n "$NOVNC_PASSWORD" ]; then
    # Generate a one-time token file for noVNC password auth
    TOKEN_FILE=/tmp/novnc-token
    echo "chrome: localhost:5900" > "$TOKEN_FILE"
    websockify \
      --web "$NOVNC_DIR" \
      --token-plugin TokenFile \
      --token-source "$TOKEN_FILE" \
      0.0.0.0:6080 \
      localhost:5900 &
    echo "noVNC ready at http://localhost:6080/vnc.html?password=$NOVNC_PASSWORD"
  else
    websockify \
      --web "$NOVNC_DIR" \
      0.0.0.0:6080 \
      localhost:5900 &
    echo "noVNC ready at http://localhost:6080/vnc.html"
  fi

  node app.js
else
  echo "Starting PROD mode (headless)..."
  node app.js
fi
