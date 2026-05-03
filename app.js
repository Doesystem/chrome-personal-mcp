import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createBrowser } from './src/browser.js';
import { registerAllTools } from './src/tools/index.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const MCP_SECRET       = process.env.MCP_SECRET;
const TRANSPORT        = process.env.TRANSPORT   ?? 'stdio';   // 'stdio' | 'http'
const HTTP_PORT        = parseInt(process.env.HTTP_PORT ?? '3000', 10);
const ALLOWED_ORIGINS  = process.env.ALLOWED_ORIGINS           // comma-separated, empty = allow all
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null;
export const TOOL_TIMEOUT_MS = parseInt(process.env.TOOL_TIMEOUT_MS ?? '30000', 10);

// ─── Init ─────────────────────────────────────────────────────────────────────

const ctx    = await createBrowser();
const server = new McpServer({ name: 'chrome-personal-mcp', version: '0.1.0' });

registerAllTools(server, ctx);

// ─── Transport ────────────────────────────────────────────────────────────────

if (TRANSPORT === 'http') {
  // Single transport instance — stateful, shared across all requests
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  console.error(`[chrome-mcp] HTTP transport ready on port ${HTTP_PORT}`);

  const httpServer = http.createServer(async (req, res) => {
    const origin = req.headers['origin'] ?? '';

    // CORS — check allowed origins if configured
    if (ALLOWED_ORIGINS && origin && !ALLOWED_ORIGINS.includes(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: origin not allowed' }));
      return;
    }

    // Health check — no auth required
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', transport: 'http' }));
      return;
    }

    // Auth
    if (MCP_SECRET) {
      const token = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
      if (token !== MCP_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    await transport.handleRequest(req, res, await readBody(req));
  });

  httpServer.listen(HTTP_PORT, '0.0.0.0');

} else {
  // stdio transport — for AI clients (Claude, Kiro, etc.)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[chrome-mcp] stdio transport ready');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
