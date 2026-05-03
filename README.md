# chrome-personal-mcp

A personal Chrome MCP server that runs a persistent Chrome session via Puppeteer inside Docker and exposes browser actions as MCP tools. Supports both **stdio** (for AI clients) and **HTTP** (for n8n) transports.

## Overview

- Runs Google Chrome in a Docker container with a persistent user profile (login sessions survive restarts)
- 32 MCP tools covering navigation, input, screenshots, network, console, emulation, performance, and memory
- **prod mode** — headless, no UI
- **debug mode** — virtual display (Xvfb) + noVNC for real-time Chrome inspection via browser
- Chrome auto-relaunches if closed or crashed — container stays alive
- All tool errors are caught and returned as structured responses — never crashes the server
- Global tool timeout configurable via `TOOL_TIMEOUT_MS`

## MCP Tools

### Navigation (7)

| Tool | Description |
|---|---|
| `navigate_page` | Go to a URL, or navigate back / forward / reload |
| `new_page` | Open a new tab and load a URL |
| `list_pages` | List all open tabs with their URLs and titles |
| `select_page` | Switch to a tab by its index |
| `close_page` | Close a tab by its index |
| `wait_for` | Wait for specified text to appear on the page |
| `wait_for_selector` | Wait for an element matching a CSS selector to appear |

### Input (10)

| Tool | Description |
|---|---|
| `click` | Click an element by CSS selector (supports double-click) |
| `hover` | Hover over an element by CSS selector |
| `fill` | Type into an input/textarea or select an option from `<select>` |
| `fill_form` | Fill multiple form fields at once |
| `type_text` | Type text into the currently focused element |
| `press_key` | Press a key or combination e.g. `Enter`, `Control+A` |
| `drag` | Drag one element onto another |
| `handle_dialog` | Accept or dismiss a browser dialog (alert, confirm, prompt) |
| `upload_file` | Upload a file through a file input element |
| `scroll` | Scroll the page or a specific element (up/down/left/right/top/bottom) |

### Screenshots & Snapshots (2)

| Tool | Description |
|---|---|
| `take_screenshot` | Screenshot the page or a specific element — returns base64 or saves to file |
| `take_snapshot` | Text snapshot of the page accessibility tree (lightweight alternative to screenshot) |

### Content & Cookies (5)

| Tool | Description |
|---|---|
| `get_content` | Get the page as plain text or raw HTML |
| `current_url` | Get the current URL and title of the active tab |
| `get_cookies` | Get all cookies for the current page |
| `set_cookies` | Set one or more cookies on the current page |
| `clear_cookies` | Clear all cookies for the current page |

### Scripting (1)

| Tool | Description |
|---|---|
| `evaluate_script` | Execute a JavaScript function in the page context and return the JSON result |

### Network (2)

| Tool | Description |
|---|---|
| `list_network_requests` | List all network requests since the last navigation (filterable by type) |
| `get_network_request` | Get full details and response body of a specific request |

### Console (2)

| Tool | Description |
|---|---|
| `list_console_messages` | List all console messages since the last navigation (filterable by type) |
| `get_console_message` | Get a specific console message by its ID |

### Emulation (2)

| Tool | Description |
|---|---|
| `emulate` | Emulate color scheme, viewport, user agent, network conditions, CPU throttling |
| `resize_page` | Resize the browser window |

### Performance (3)

| Tool | Description |
|---|---|
| `performance_start_trace` | Start a performance trace (optionally reload the page) |
| `performance_stop_trace` | Stop the trace and save to a JSON file |
| `performance_analyze_insight` | Get page performance metrics: TTFB, FCP, DOMContentLoaded, Load |

### Memory (1)

| Tool | Description |
|---|---|
| `take_memory_snapshot` | Capture a JavaScript heap snapshot to a `.heapsnapshot` file |

## Requirements

- Docker + Docker Compose v2

## Quick Start

```bash
cp .env.example .env
# edit .env and set MCP_SECRET and other values
docker compose up --build -d
docker compose logs -f
```

## Transport Modes

### stdio — for AI clients (Claude, Kiro, etc.)

Set `TRANSPORT=stdio` in `.env`. Add to your MCP client config:

```json
{
  "mcpServers": {
    "chrome": {
      "command": "docker",
      "args": ["compose", "-f", "/path/to/chrome-personal-mcp/docker-compose.yml", "run", "--rm", "chrome-mcp"],
      "env": { "MCP_SECRET": "your-secret-here" }
    }
  }
}
```

### HTTP — for n8n

Set `TRANSPORT=http` in `.env` (default). The server listens on port `3000`.

**Health check:**
```
GET http://localhost:3000/health
→ { "status": "ok", "transport": "http" }
```

**n8n HTTP Request node:**
```
Method: POST
URL:    http://chrome-personal-mcp:3000
Header: Authorization: Bearer <MCP_SECRET>
Body:
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "navigate_page",
    "arguments": { "type": "url", "url": "https://example.com" }
  }
}
```

> If n8n and chrome-personal-mcp are in different Docker Compose projects, add them to a shared network so n8n can reach `chrome-personal-mcp:3000`.

## Security

### MCP auth token
Set `MCP_SECRET` in `.env`. Every tool call must pass a matching `token` parameter. Leave empty only on a fully trusted local machine.

### Origin whitelist
Set `ALLOWED_ORIGINS` to restrict which origins can call the HTTP endpoint, e.g.:
```
ALLOWED_ORIGINS=http://localhost:5678,https://n8n.example.com
```
Leave empty to allow all origins.

### VNC
- Raw VNC (port 5900) is bound to `127.0.0.1` only
- Set `VNC_PASSWORD` in `.env` to require a password
- For remote access use an SSH tunnel: `ssh -L 5900:localhost:5900 user@host`
- noVNC (port 6080) should be protected by nginx basic auth when exposed publicly

### Container user
The entrypoint runs as root only to fix `/data` volume permissions, then drops to the built-in `node` user (uid 1000) before launching the app.

## Debug Mode (noVNC)

Set `MODE=debug` in `.env`, then:

```bash
docker compose up --build
```

Open a browser at `http://localhost:6080/vnc.html` to see and interact with Chrome in real time.

Raw VNC is also available at `localhost:5900` (requires a VNC client).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MODE` | `prod` | `prod` = headless, `debug` = Xvfb + noVNC + VNC |
| `TRANSPORT` | `http` | `stdio` for AI clients, `http` for n8n |
| `HTTP_PORT` | `3000` | Port for HTTP transport |
| `MCP_SECRET` | _(empty)_ | Auth token checked on every tool call |
| `VNC_PASSWORD` | _(empty)_ | Password for raw VNC (port 5900) |
| `TOOL_TIMEOUT_MS` | `30000` | Global tool execution timeout in milliseconds |
| `ALLOWED_ORIGINS` | _(empty)_ | Comma-separated allowed origins for HTTP transport. Empty = allow all |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/google-chrome` | Chrome binary path (set in Dockerfile) |

## Project Structure

```
chrome-personal-mcp/
├── app.js                   # Entry point — config, server, transport, health check
├── start.sh                 # Entrypoint script — prod/debug mode selection
├── Dockerfile               # Node 20 + Chrome + Xvfb + noVNC
├── docker-compose.yml       # Service config (reads from .env)
├── package.json
├── .env.example             # Config template — copy to .env
├── .env                     # Local config — gitignored
├── src/
│   ├── browser.js           # Browser launch, relaunch, hook system, multi-tab ctx
│   ├── auth.js              # MCP_SECRET check + tool() wrapper (error handling + timeout)
│   └── tools/
│       ├── index.js         # Registers all tools — add new tools here
│       ├── navigate.js      # navigate_page, new_page, list_pages, select_page, close_page, wait_for, wait_for_selector
│       ├── input.js         # click, hover, fill, fill_form, type_text, press_key, drag, handle_dialog, upload_file, scroll
│       ├── screenshot.js    # take_screenshot, take_snapshot
│       ├── content.js       # get_content, current_url, get_cookies, set_cookies, clear_cookies
│       ├── evaluate.js      # evaluate_script
│       ├── network.js       # list_network_requests, get_network_request
│       ├── console.js       # list_console_messages, get_console_message
│       ├── emulation.js     # emulate, resize_page
│       ├── performance.js   # performance_start_trace, performance_stop_trace, performance_analyze_insight
│       └── memory.js        # take_memory_snapshot
└── data/                    # Volume mount (./data on host)
    ├── chrome-profile/      # Persistent Chrome profile (cookies, sessions)
    ├── last.png             # Most recent screenshot
    ├── trace.json           # Performance trace output
    └── heap.heapsnapshot    # Memory heap snapshot output
```

## Volumes

| Container path | Host path | Description |
|---|---|---|
| `/data/chrome-profile` | `./data/chrome-profile` | Persistent Chrome profile — cookies and login sessions |
| `/data/last.png` | `./data/last.png` | Most recent screenshot |
| `/data/trace.json` | `./data/trace.json` | Performance trace output |
| `/data/heap.heapsnapshot` | `./data/heap.heapsnapshot` | Memory heap snapshot output |

## Ports

| Port | Description |
|---|---|
| `3000` | MCP HTTP endpoint + `GET /health` (`TRANSPORT=http`) |
| `6080` | noVNC web UI — `http://localhost:6080/vnc.html` (debug mode only) |
| `127.0.0.1:5900` | Raw VNC — localhost only, SSH tunnel for remote access (debug mode only) |

## First-time Login

To log in to a site and persist the session:

1. Set `MODE=debug` in `.env`
2. Run `docker compose up --build`
3. Open `http://localhost:6080/vnc.html` in a browser
4. Log in through the Chrome window
5. Stop the container and set `MODE=prod`
6. Run `docker compose up` — Chrome reuses the saved session from `./data/chrome-profile`

## Adding a New Tool

1. Create `src/tools/my_tool.js`:
```js
import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

export function registerMyTool(server, ctx) {
  server.tool('my_tool', 'Description', {
    param: z.string(),
    token: z.string().optional(),
  }, tool(async ({ param, token }) => {
    checkAuth(token);
    // use ctx.page, ctx.browser, ctx.newPage(), ctx.onNewPage()
    return { content: [{ type: 'text', text: 'result' }] };
  }));
}
```

2. Add one line to `src/tools/index.js`:
```js
import { registerMyTool } from './my_tool.js';
// inside registerAllTools:
registerMyTool(server, ctx);
```

The `tool()` wrapper automatically handles errors and timeouts — no try/catch needed.
