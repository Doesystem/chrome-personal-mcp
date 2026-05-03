import { z } from 'zod';
import { checkAuth } from '../auth.js';

// Console messages captured per-page
const consoleLog = new Map(); // pageUrl → message[]
let msgCounter = 0;

export function registerConsole(server, ctx) {

  function attachConsoleCapture(page) {
    page.on('console', msg => {
      const pageUrl = page.url();
      if (!consoleLog.has(pageUrl)) consoleLog.set(pageUrl, []);
      consoleLog.get(pageUrl).push({
        msgid: ++msgCounter,
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });
    page.on('pageerror', err => {
      const pageUrl = page.url();
      if (!consoleLog.has(pageUrl)) consoleLog.set(pageUrl, []);
      consoleLog.get(pageUrl).push({
        msgid: ++msgCounter,
        type: 'error',
        text: err.message,
        timestamp: Date.now(),
      });
    });
  }

  attachConsoleCapture(ctx.page);
  ctx.attachConsoleCapture = attachConsoleCapture;

  // list_console_messages
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
    async ({ types, page_size, page_idx, token }) => {
      checkAuth(token);
      const pageUrl = ctx.page.url();
      let messages = consoleLog.get(pageUrl) ?? [];
      if (types?.length) messages = messages.filter(m => types.includes(m.type));
      const start = (page_idx ?? 0) * (page_size ?? messages.length);
      const slice = page_size ? messages.slice(start, start + page_size) : messages;
      const lines = slice.map(m => `[${m.msgid}] [${m.type}] ${m.text}`);
      return { content: [{ type: 'text', text: lines.join('\n') || 'No console messages' }] };
    }
  );

  // get_console_message — get a specific message by ID
  server.tool(
    'get_console_message',
    'Get a specific console message by its ID (from list_console_messages)',
    {
      msgid: z.number().int().describe('Message ID from list_console_messages'),
      token: z.string().optional(),
    },
    async ({ msgid, token }) => {
      checkAuth(token);
      const pageUrl = ctx.page.url();
      const messages = consoleLog.get(pageUrl) ?? [];
      const msg = messages.find(m => m.msgid === msgid);
      if (!msg) throw new Error(`Message ${msgid} not found`);
      return { content: [{ type: 'text', text: `[${msg.msgid}] [${msg.type}] ${msg.text}` }] };
    }
  );
}
