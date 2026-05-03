#!/bin/bash

if [ "$MODE" = "debug" ]; then
  echo "Starting DEBUG mode (Xvfb + VNC)..."

  Xvfb :99 -screen 0 1280x800x24 &
  export DISPLAY=:99

  fluxbox &
  x11vnc -display :99 -forever -nopw -listen 0.0.0.0 -xkb &

  node app.js
else
  echo "Starting PROD mode (headless)..."
  node app.js
fi