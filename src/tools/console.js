import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

// Fixed-size ring buffer per page — prevents unbounded memory growth
const MAX_MESSAGES_PER_PAGE = 500;
const consoleLog = new Map(); // pageUrl → message[]
let msgCounter = 0;

function logMessage(pageUrl, entry) {
  if (!consoleLog.has(pageUrl)) consoleLog.set(pageUrl, []);
  const log = consoleLog.get(pageUrl);
  log.push(entry);
  if (log.length > MAX_MESSAGES_PER_PAGE) log.splice(0, log.length - MAX_MESSAGES_PER_PAGE);
}

// Attach console capture to a page — called via ctx.onNewPage hook
export function attachConsoleCapture(page) {
  page.on('console', msg => {
    logMessage(page.url(), {
      msgid: ++msgCounter,
      type: msg.type(),
      text: msg.text(),
      timestamp: Date.now(),
    });
  });

  page.on('pageerror', err => {
    logMessage(page.url(), {
      msgid: ++msgCounter,
      type: 'error',
      text: err.message,
      timestamp: Date.now(),
    });
  });

  // Clear log on navigation
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      consoleLog.delete(frame.url());
    }
  });
}

export function registerConsole(server, ctx) {
  // Register hook so every new page gets console capture
  ctx.onNewPage(async (page) => attachConsoleCapture(page));
  attachConsoleCapture(ctx.page);

  server.tool(
    'list_console_messages',
    'List all console messages on the current page since the last navigation',
    {
      types: z.array(z.string()).optional()
        .describe('Filter by type: log, info, warn, error, debug'),
      page_size: z.number().int().optional(),
      page_idx: z.number().int().optional().default(0),
      token: z.string().optional(),
    },
    tool(async ({ types, page_size, page_idx, token }) => {
      checkAuth(token);
      const pageUrl = ctx.page.url();
      let messages = consoleLog.get(pageUrl) ?? [];
      if (types?.length) messages = messages.filter(m => types.includes(m.type));
      const start = (page_idx ?? 0) * (page_size ?? messages.length);
      const slice = page_size ? messages.slice(start, start + page_size) : messages;
      const lines = slice.map(m =>
        `[${m.msgid}] [${m.type}] ${new Date(m.timestamp).toISOString()} ${m.text}`
      );
      return { content: [{ type: 'text', text: lines.join('\n') || 'No console messages' }] };
    })
  );

  server.tool(
    'get_console_message',
    'Get a specific console message by its ID (from list_console_messages)',
    {
      msgid: z.number().int().describe('Message ID from list_console_messages'),
      token: z.string().optional(),
    },
    tool(async ({ msgid, token }) => {
      checkAuth(token);
      const pageUrl = ctx.page.url();
      const messages = consoleLog.get(pageUrl) ?? [];
      const msg = messages.find(m => m.msgid === msgid);
      if (!msg) throw new Error(`Message ${msgid} not found`);
      return { content: [{ type: 'text', text: `[${msg.msgid}] [${msg.type}] ${msg.text}` }] };
    })
  );
}
