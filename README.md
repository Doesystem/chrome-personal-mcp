# chrome-personal-mcp

A personal Chrome MCP server that runs a persistent Chrome session via Puppeteer inside Docker and exposes browser actions as MCP tools over stdio.

## Overview

- Runs Google Chrome in a Docker container with a persistent user profile (login sessions survive restarts)
- Exposes browser actions as MCP tools consumable by any MCP-compatible AI client (Claude, Kiro, etc.)
- **prod mode** — headless, no UI
- **debug mode** — virtual display (Xvfb) + VNC for real-time Chrome inspection and manual login

## MCP Tools

| Tool | Description |
|---|---|
| `navigate` | Navigate to a URL and wait for the page to load |
| `screenshot` | Capture the current page as a base64 PNG image |
| `get_content` | Get the page as plain text or raw HTML |
| `click` | Click an element by CSS selector |
| `type` | Type text into an input element |
| `evaluate` | Execute JavaScript in the page context |
| `current_url` | Get the current URL and page title |

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

## MCP Client Configuration

The server communicates over **stdio**. Add it to your MCP client config:

```json
{
  "mcpServers": {
    "chrome": {
      "command": "docker",
      "args": ["compose", "-f", "/path/to/chrome-personal-mcp/docker-compose.yml", "run", "--rm", "chrome-mcp"],
      "env": {
        "MCP_SECRET": "your-secret-here"
      }
    }
  }
}
```

## Security

### MCP auth token
Set `MCP_SECRET` in `docker-compose.yml` (or as an environment variable). Every tool call must include a matching `token` parameter. If `MCP_SECRET` is empty, the server is open — only use that on a fully trusted local machine.

### VNC
- VNC is bound to `127.0.0.1` only — not exposed to the network
- Set `VNC_PASSWORD` to require a password when connecting
- For remote access, use an SSH tunnel: `ssh -L 5900:localhost:5900 user@host`

### Container user
The container runs as a non-root user (`uid 1000`) for better isolation.

## Debug Mode (VNC)

Set `MODE=debug` in `docker-compose.yml`, then:

```bash
docker compose up --build
```

Connect a VNC viewer to `localhost:5900`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MODE` | `prod` | `prod` = headless, `debug` = Xvfb + VNC |
| `MCP_SECRET` | _(empty)_ | Auth token required on every tool call. Leave empty to disable auth (trusted network only). |
| `VNC_PASSWORD` | _(empty)_ | VNC password for debug mode. Leave empty for unauthenticated (localhost only). |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/google-chrome` | Path to the Chrome binary (set in Dockerfile) |

## Project Structure

```
chrome-personal-mcp/
├── app.js              # MCP server — Puppeteer + MCP tools
├── start.sh            # Entrypoint — selects prod or debug mode
├── Dockerfile          # Node 20 + Chrome + Xvfb + VNC, non-root user
├── docker-compose.yml  # Service config
├── package.json        # Dependencies
└── data/               # Volume mount (./data on host)
    ├── chrome-profile/ # Persistent Chrome user data (cookies, sessions)
    └── last.png        # Most recent screenshot
```

## Volumes

| Container path | Host path | Description |
|---|---|---|
| `/data/chrome-profile` | `./data/chrome-profile` | Persistent Chrome profile — cookies and login sessions |
| `/data/last.png` | `./data/last.png` | Most recent screenshot saved by the `screenshot` tool |

## Ports

| Port | Description |
|---|---|
| `127.0.0.1:5900` | VNC server — only active when `MODE=debug`, localhost only |

## First-time Login

To log in to a site and persist the session:

1. Set `MODE=debug` in `docker-compose.yml`
2. Run `docker compose up --build`
3. Connect VNC at `localhost:5900`
4. Log in through the Chrome window visible in VNC
5. Stop the container and set `MODE=prod`
6. Run `docker compose up` — Chrome reuses the saved session from `./data/chrome-profile`
