import { z } from 'zod';
import { checkAuth } from '../auth.js';

// Network requests are captured per-page via CDP request interception
const requestLog = new Map(); // pageUrl → request[]
let requestCounter = 0;

export function registerNetwork(server, ctx) {

  // Attach CDP session to capture network events on the active page
  // Called once per page (including after relaunch)
  async function attachNetworkCapture(page) {
    const client = await page.createCDPSession();
    await client.send('Network.enable');

    client.on('Network.responseReceived', (event) => {
      const pageUrl = page.url();
      if (!requestLog.has(pageUrl)) requestLog.set(pageUrl, []);
      requestLog.get(pageUrl).push({
        reqid: ++requestCounter,
        url: event.response.url,
        method: event.request?.method ?? 'GET',
        status: event.response.status,
        type: event.type,
        mimeType: event.response.mimeType,
        requestId: event.requestId,
        _client: client,
      });
    });
  }

  // Attach on startup and expose attach function for new pages
  attachNetworkCapture(ctx.page).catch(() => {});
  ctx.attachNetworkCapture = attachNetworkCapture;

  // list_network_requests
  server.tool(
    'list_network_requests',
    'List all network requests captured since the last navigation on the current page',
    {
      resource_types: z.array(z.string()).optional()
        .describe('Filter by type: Document, Stylesheet, Script, Image, XHR, Fetch, etc.'),
      page_size: z.number().int().optional().describe('Max requests to return'),
      page_idx: z.number().int().optional().default(0),
      token: z.string().optional(),
    },
    async ({ resource_types, page_size, page_idx, token }) => {
      checkAuth(token);
      const pageUrl = ctx.page.url();
      let requests = requestLog.get(pageUrl) ?? [];
      if (resource_types?.length) {
        requests = requests.filter(r => resource_types.includes(r.type));
      }
      const start = (page_idx ?? 0) * (page_size ?? requests.length);
      const slice = page_size ? requests.slice(start, start + page_size) : requests;
      const lines = slice.map(r =>
        `[${r.reqid}] ${r.method} ${r.status} ${r.type} ${r.url}`
      );
      return { content: [{ type: 'text', text: lines.join('\n') || 'No requests captured' }] };
    }
  );

  // get_network_request — get details of a specific request
  server.tool(
    'get_network_request',
    'Get details of a network request by its ID (from list_network_requests)',
    {
      reqid: z.number().int().describe('Request ID from list_network_requests'),
      token: z.string().optional(),
    },
    async ({ reqid, token }) => {
      checkAuth(token);
      const pageUrl = ctx.page.url();
      const requests = requestLog.get(pageUrl) ?? [];
      const req = requests.find(r => r.reqid === reqid);
      if (!req) throw new Error(`Request ${reqid} not found`);

      let body = '';
      try {
        const resp = await req._client.send('Network.getResponseBody', { requestId: req.requestId });
        body = resp.base64Encoded
          ? Buffer.from(resp.body, 'base64').toString('utf-8').slice(0, 10_000)
          : resp.body.slice(0, 10_000);
      } catch {
        body = '(body not available)';
      }

      const text = [
        `ID: ${req.reqid}`,
        `URL: ${req.url}`,
        `Method: ${req.method}`,
        `Status: ${req.status}`,
        `Type: ${req.type}`,
        `MIME: ${req.mimeType}`,
        `--- Body (first 10KB) ---`,
        body,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );
}
