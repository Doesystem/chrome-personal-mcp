FROM node:20-bullseye

# ---------- System deps ----------
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libgbm1 libgtk-3-0 \
    libnspr4 libnss3 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxrandr2 libxrender1 libxshmfence1 libxss1 libxtst6 \
    xdg-utils xvfb x11vnc fluxbox \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ---------- Chrome ----------
RUN wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

# ---------- Non-root user ----------
# Chrome requires --no-sandbox when running as root.
# Running as a non-root user is safer even with --no-sandbox.
RUN groupadd -g 1000 appuser && useradd -u 1000 -g appuser -m appuser

# ---------- App ----------
WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

# ---------- Data volume ----------
# /data holds the Chrome profile and screenshots.
# Must be writable by appuser.
RUN mkdir -p /data && chown -R appuser:appuser /data /app

# ---------- Entrypoint ----------
COPY start.sh /start.sh
RUN chmod +x /start.sh

USER appuser

CMD ["/start.sh"]
