const MCP_SECRET = process.env.MCP_SECRET;

export function checkAuth(token) {
  if (!MCP_SECRET) return; // no secret set — open access (trusted network only)
  if (token !== MCP_SECRET) throw new Error('Unauthorized: invalid MCP_SECRET');
}
