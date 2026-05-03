import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

// Fixed-size ring buffer per page — prevents unbounded memory growth
const MAX_REQUESTS_PER_PAGE = 500;
const requestLog = new Map(); // pageUrl → request[]
let requestCounter = 0;

function logRequest(pageUrl, entry) {
  if (!requestLog.has(pageUrl)) requestLog.set(pageUrl, []);
  const log = requestLog.get(pageUrl);
  log.push(entry);
  // Trim oldest entries when over limit
  if (log.length > MAX_REQUESTS_PER_PAGE) log.splice(0, log.length - MAX_REQUESTS_PER_PAGE);
}

// Attach CDP network capture to a page — called via ctx.onNewPage hook
export async function attachNetworkCapture(page) {
  const client = await page.createCDPSession();
  await client.send('Network.enable');

  client.on('Network.responseReceived', (event) => {
    logRequest(page.url(), {
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

  // Clear log on navigation so stale entries don't accumulate
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      requestLog.delete(frame.url());
    }
  });
}

export function registerNetwork(server, ctx) {
  // Register hook so every new page (including after relaunch) gets network capture
  ctx.onNewPage(attachNetworkCapture);
  // Attach to the initial page that already exists
  attachNetworkCapture(ctx.page).catch(() => {});

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
    tool(async ({ resource_types, page_size, page_idx, token }) => {
      checkAuth(token);
      const pageUrl = ctx.page.url();
      let requests = requestLog.get(pageUrl) ?? [];
      if (resource_types?.length) {
        requests = requests.filter(r => resource_types.includes(r.type));
      }
      const start = (page_idx ?? 0) * (page_size ?? requests.length);
      const slice = page_size ? requests.slice(start, start + page_size) : requests;
      const lines = slice.map(r => `[${r.reqid}] ${r.method} ${r.status} ${r.type} ${r.url}`);
      return { content: [{ type: 'text', text: lines.join('\n') || 'No requests captured' }] };
    })
  );

  server.tool(
    'get_network_request',
    'Get details and response body of a network request by its ID (from list_network_requests)',
    {
      reqid: z.number().int().describe('Request ID from list_network_requests'),
      token: z.string().optional(),
    },
    tool(async ({ reqid, token }) => {
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
    })
  );
}
