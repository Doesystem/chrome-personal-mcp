import puppeteer from 'puppeteer';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ─── Config ───────────────────────────────────────────────────────────────────

const isDebug = process.env.MODE === 'debug';
const MCP_SECRET = process.env.MCP_SECRET; // optional auth token — checked on every tool call

// ─── Browser ──────────────────────────────────────────────────────────────────

const browser = await puppeteer.launch({
  headless: !isDebug,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  userDataDir: '/data/chrome-profile',
  args: [
    '--no-sandbox',           // required inside Docker (no user namespace)
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', // use /tmp instead of /dev/shm to avoid OOM
    '--disable-gpu',
    '--window-size=1280,800',
  ],
  defaultViewport: null,
});

const page = await browser.newPage();

// forward page console logs to stdout for debugging
page.on('console', msg => console.error('[page]', msg.text()));

// ─── Auth helper ──────────────────────────────────────────────────────────────

function checkAuth(token) {
  if (!MCP_SECRET) return; // no secret configured — open access (trusted network only)
  if (token !== MCP_SECRET) throw new Error('Unauthorized: invalid MCP_SECRET');
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'chrome-personal-mcp',
  version: '0.1.0',
});

// navigate — go to a URL
server.tool(
  'navigate',
  'Navigate the browser to a URL and wait for the page to load',
  {
    url: z.string().url().describe('The URL to navigate to'),
    wait_until: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2'])
      .optional()
      .default('networkidle2')
      .describe('When to consider navigation complete'),
    token: z.string().optional().describe('MCP_SECRET auth token (required if server is configured with one)'),
  },
  async ({ url, wait_until, token }) => {
    checkAuth(token);
    await page.goto(url, { waitUntil: wait_until });
    const title = await page.title();
    return { content: [{ type: 'text', text: `Navigated to: ${url}\nPage title: ${title}` }] };
  }
);

// screenshot — capture current page
server.tool(
  'screenshot',
  'Take a screenshot of the current page and return it as a base64 image',
  {
    full_page: z.boolean().optional().default(false).describe('Capture the full scrollable page'),
    token: z.string().optional().describe('MCP_SECRET auth token'),
  },
  async ({ full_page, token }) => {
    checkAuth(token);
    const buf = await page.screenshot({ fullPage: full_page, encoding: 'base64' });
    // also save to disk for easy inspection
    await page.screenshot({ path: '/data/last.png', fullPage: full_page });
    return {
      content: [{
        type: 'image',
        data: buf,
        mimeType: 'image/png',
      }],
    };
  }
);

// get_content — return page text or HTML
server.tool(
  'get_content',
  'Get the text content or full HTML of the current page',
  {
    format: z.enum(['text', 'html']).optional().default('text').describe('Return plain text or raw HTML'),
    token: z.string().optional().describe('MCP_SECRET auth token'),
  },
  async ({ format, token }) => {
    checkAuth(token);
    const content = format === 'html'
      ? await page.content()
      : await page.evaluate(() => document.body.innerText);
    return { content: [{ type: 'text', text: content }] };
  }
);

// click — click an element by CSS selector
server.tool(
  'click',
  'Click an element on the page using a CSS selector',
  {
    selector: z.string().describe('CSS selector of the element to click'),
    token: z.string().optional().describe('MCP_SECRET auth token'),
  },
  async ({ selector, token }) => {
    checkAuth(token);
    await page.waitForSelector(selector, { timeout: 10_000 });
    await page.click(selector);
    return { content: [{ type: 'text', text: `Clicked: ${selector}` }] };
  }
);

// type — type text into an element
server.tool(
  'type',
  'Type text into an input element using a CSS selector',
  {
    selector: z.string().describe('CSS selector of the input element'),
    text: z.string().describe('Text to type'),
    clear_first: z.boolean().optional().default(true).describe('Clear existing value before typing'),
    token: z.string().optional().describe('MCP_SECRET auth token'),
  },
  async ({ selector, text, clear_first, token }) => {
    checkAuth(token);
    await page.waitForSelector(selector, { timeout: 10_000 });
    if (clear_first) await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (el) el.value = '';
    }, selector);
    await page.type(selector, text);
    return { content: [{ type: 'text', text: `Typed into: ${selector}` }] };
  }
);

// evaluate — run arbitrary JS in the page context
server.tool(
  'evaluate',
  'Execute JavaScript in the browser page context and return the result',
  {
    script: z.string().describe('JavaScript expression to evaluate in the page context'),
    token: z.string().optional().describe('MCP_SECRET auth token'),
  },
  async ({ script, token }) => {
    checkAuth(token);
    const result = await page.evaluate(script);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// current_url — return the current page URL
server.tool(
  'current_url',
  'Get the current URL and title of the browser page',
  {
    token: z.string().optional().describe('MCP_SECRET auth token'),
  },
  async ({ token }) => {
    checkAuth(token);
    const url = page.url();
    const title = await page.title();
    return { content: [{ type: 'text', text: `URL: ${url}\nTitle: ${title}` }] };
  }
);

// ─── Debug mode — pause for manual login via VNC ─────────────────────────────

if (isDebug) {
  console.error('[chrome-mcp] Debug mode: 60s pause for manual actions via VNC...');
  await new Promise(r => setTimeout(r, 60_000));
  console.error('[chrome-mcp] Resuming — starting MCP server');
}

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[chrome-mcp] MCP server ready (stdio)');
