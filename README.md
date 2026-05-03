# chrome-personal-mcp

Personal Chrome MCP server that runs Chrome via Puppeteer inside Docker with a persistent user profile and a VNC-based debug mode.

## Overview

- Runs Google Chrome in a Docker container with a persistent user profile (login sessions survive container restarts)
- **prod mode** — headless, no UI
- **debug mode** — virtual display (Xvfb) + VNC for real-time Chrome inspection

## Requirements

- Docker + Docker Compose v2
- VNC viewer (e.g. [RealVNC](https://www.realvnc.com/), [TigerVNC](https://tigervnc.org/)) for debug mode

## Quick Start

```bash
# build and run
docker compose up --build

# run in background
docker compose up --build -d
```

## Debug Mode (VNC)

Open `docker-compose.yml` and change the environment variable:

```yaml
environment:
  - MODE=debug
```

Then connect a VNC viewer to `localhost:5900` (no password).

```bash
vncviewer localhost:5900
```

## Project Structure

```
chrome-personal-mcp/
├── app.js              # Main Puppeteer script
├── start.sh            # Entrypoint — selects prod or debug mode
├── Dockerfile          # Node 20 + Chrome + Xvfb + VNC
├── docker-compose.yml  # Service config
├── package.json        # Dependencies (puppeteer)
└── data/               # Volume mount — Chrome profile + screenshots
    ├── chrome-profile/ # Persistent Chrome user data (cookies, login sessions)
    └── last.png        # Most recent screenshot
```

## Volumes

| Container path | Host path | Description |
|---|---|---|
| `/data/chrome-profile` | `./data/chrome-profile` | Chrome user profile — stores cookies and login sessions |
| `/data/last.png` | `./data/last.png` | Most recent screenshot |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MODE` | `prod` | `prod` = headless, `debug` = Xvfb + VNC |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/google-chrome` | Path to the Chrome binary (set in Dockerfile) |

## Ports

| Port | Description |
|---|---|
| `5900` | VNC server — only active when `MODE=debug` |

## First-time Login

To log in to a website and persist the session:

1. Set `MODE=debug` in `docker-compose.yml`
2. Run `docker compose up --build`
3. Connect VNC at `localhost:5900`
4. Log in through the Chrome window visible in VNC
5. Stop the container and revert to `MODE=prod`
6. Run `docker compose up` — Chrome will reuse the saved session from `./data/chrome-profile`
