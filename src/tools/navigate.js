import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

export function registerNavigate(server, ctx) {

  server.tool(
    'navigate_page',
    'Go to a URL, or navigate back, forward, or reload the current page',
    {
      type: z.enum(['url', 'back', 'forward', 'reload']).optional().default('url'),
      url: z.string().optional().describe('Target URL (only when type=url)'),
      ignore_cache: z.boolean().optional().default(false),
      timeout: z.number().int().optional().describe('Max wait time in ms (0 = default)'),
      token: z.string().optional(),
    },
    tool(async ({ type, url, ignore_cache, timeout, token }) => {
      checkAuth(token);
      const opts = { waitUntil: 'networkidle2', timeout: timeout || 30_000 };
      if (type === 'url') {
        if (!url) throw new Error('url is required when type=url');
        await ctx.page.goto(url, opts);
      } else if (type === 'back') {
        await ctx.page.goBack(opts);
      } else if (type === 'forward') {
        await ctx.page.goForward(opts);
      } else if (type === 'reload') {
        await ctx.page.reload({ ...opts, ...(ignore_cache ? { cache: 'reload' } : {}) });
      }
      const title = await ctx.page.title();
      return { content: [{ type: 'text', text: `Page: ${ctx.page.url()}\nTitle: ${title}` }] };
    })
  );

  server.tool(
    'new_page',
    'Open a new tab and navigate to a URL',
    {
      url: z.string().url().describe('URL to load in the new tab'),
      background: z.boolean().optional().default(false)
        .describe('Open in background without switching to it'),
      token: z.string().optional(),
    },
    tool(async ({ url, background, token }) => {
      checkAuth(token);
      const newPage = await ctx.newPage(); // uses ctx.newPage() which runs all hooks
      await newPage.goto(url, { waitUntil: 'networkidle2' });
      if (!background) ctx.setPage(newPage);
      const pages = await ctx.browser.pages();
      return { content: [{ type: 'text', text: `Opened tab ${pages.indexOf(newPage)}: ${url}` }] };
    })
  );

  server.tool(
    'list_pages',
    'Get a list of all open tabs in the browser',
    { token: z.string().optional() },
    tool(async ({ token }) => {
      checkAuth(token);
      const pages = await ctx.browser.pages();
      const list = await Promise.all(pages.map(async (p, i) => {
        const title = await p.title().catch(() => '');
        const active = p === ctx.page ? ' ◀ active' : '';
        return `[${i}] ${p.url()} — ${title}${active}`;
      }));
      return { content: [{ type: 'text', text: list.join('\n') }] };
    })
  );

  server.tool(
    'select_page',
    'Switch to a tab by its index (from list_pages)',
    {
      page_id: z.number().int().describe('Tab index from list_pages'),
      bring_to_front: z.boolean().optional().default(true),
      token: z.string().optional(),
    },
    tool(async ({ page_id, bring_to_front, token }) => {
      checkAuth(token);
      const pages = await ctx.browser.pages();
      if (page_id < 0 || page_id >= pages.length)
        throw new Error(`Invalid page_id ${page_id} — ${pages.length} pages open`);
      ctx.setPage(pages[page_id]);
      if (bring_to_front) await ctx.page.bringToFront();
      return { content: [{ type: 'text', text: `Switched to tab ${page_id}: ${ctx.page.url()}` }] };
    })
  );

  server.tool(
    'close_page',
    'Close a tab by its index. The last open tab cannot be closed.',
    {
      page_id: z.number().int().describe('Tab index from list_pages'),
      token: z.string().optional(),
    },
    tool(async ({ page_id, token }) => {
      checkAuth(token);
      const pages = await ctx.browser.pages();
      if (pages.length <= 1) throw new Error('Cannot close the last open tab');
      if (page_id < 0 || page_id >= pages.length)
        throw new Error(`Invalid page_id ${page_id}`);
      await pages[page_id].close();
      const remaining = await ctx.browser.pages();
      if (!remaining.includes(ctx.page)) ctx.setPage(remaining[0]);
      return { content: [{ type: 'text', text: `Closed tab ${page_id}` }] };
    })
  );

  server.tool(
    'wait_for',
    'Wait for specified text to appear on the current page',
    {
      text: z.array(z.string()).min(1)
        .describe('Resolves when any of these strings appears on the page'),
      timeout: z.number().int().optional().default(30_000),
      token: z.string().optional(),
    },
    tool(async ({ text, timeout, token }) => {
      checkAuth(token);
      await Promise.race(
        text.map(t => ctx.page.waitForFunction(
          str => document.body.innerText.includes(str),
          { timeout },
          t
        ))
      );
      return { content: [{ type: 'text', text: 'Text found on page' }] };
    })
  );

  // #7 — wait_for_selector
  server.tool(
    'wait_for_selector',
    'Wait for an element matching a CSS selector to appear on the page',
    {
      selector: z.string().describe('CSS selector to wait for'),
      timeout: z.number().int().optional().default(30_000),
      token: z.string().optional(),
    },
    tool(async ({ selector, timeout, token }) => {
      checkAuth(token);
      await ctx.page.waitForSelector(selector, { timeout });
      return { content: [{ type: 'text', text: `Selector found: ${selector}` }] };
    })
  );
}
