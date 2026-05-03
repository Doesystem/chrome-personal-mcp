import { TOOL_TIMEOUT_MS } from '../app.js';

const MCP_SECRET = process.env.MCP_SECRET;

export function checkAuth(token) {
  if (!MCP_SECRET) return;
  if (token !== MCP_SECRET) throw new Error('Unauthorized: invalid MCP_SECRET');
}

/**
 * Wrap a tool handler with:
 * - Structured error response (never throws to MCP layer)
 * - Global timeout (TOOL_TIMEOUT_MS)
 */
export function tool(fn) {
  return async (args) => {
    try {
      const result = await Promise.race([
        fn(args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool timed out after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS)
        ),
      ]);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[tool] error:', msg);
      return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
    }
  };
}
