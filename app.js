import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createBrowser } from './src/browser.js';
import { registerAllTools } from './src/tools/index.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const MCP_SECRET = process.env.MCP_SECRET;
const TRANSPORT  = process.env.TRANSPORT  ?? 'stdio'; // 'stdio' | 'http'
const HTTP_PORT  = parseInt(process.env.HTTP_PORT ?? '3000', 10);

// ─── Init ─────────────────────────────────────────────────────────────────────

const ctx    = await createBrowser();
const server = new McpServer({ name: 'chrome-personal-mcp', version: '0.1.0' });

registerAllTools(server, ctx);

// ─── Transport ────────────────────────────────────────────────────────────────

if (TRANSPORT === 'http') {
  // HTTP transport — for n8n MCP Client node or HTTP Request node
  const httpServer = http.createServer(async (req, res) => {
    if (MCP_SECRET) {
      const token = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
      if (token !== MCP_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, await readBody(req));
  });

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.error(`[chrome-mcp] HTTP transport ready on port ${HTTP_PORT}`);
  });

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
