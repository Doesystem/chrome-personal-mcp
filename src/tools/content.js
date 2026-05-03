import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

export function registerContent(server, ctx) {

  server.tool(
    'get_content',
    'Get the text content or full HTML of the current page',
    {
      format: z.enum(['text', 'html']).optional().default('text'),
      token: z.string().optional(),
    },
    tool(async ({ format, token }) => {
      checkAuth(token);
      const content = format === 'html'
        ? await ctx.page.content()
        : await ctx.page.evaluate(() => document.body.innerText);
      return { content: [{ type: 'text', text: content }] };
    })
  );

  server.tool(
    'current_url',
    'Get the current URL and title of the active browser tab',
    { token: z.string().optional() },
    tool(async ({ token }) => {
      checkAuth(token);
      const url   = ctx.page.url();
      const title = await ctx.page.title();
      return { content: [{ type: 'text', text: `URL: ${url}\nTitle: ${title}` }] };
    })
  );

  // #8 — cookies tools
  server.tool(
    'get_cookies',
    'Get all cookies for the current page',
    { token: z.string().optional() },
    tool(async ({ token }) => {
      checkAuth(token);
      const cookies = await ctx.page.cookies();
      const lines = cookies.map(c =>
        `${c.name}=${c.value} (domain=${c.domain}, path=${c.path}, secure=${c.secure})`
      );
      return { content: [{ type: 'text', text: lines.join('\n') || 'No cookies' }] };
    })
  );

  server.tool(
    'set_cookies',
    'Set one or more cookies on the current page',
    {
      cookies: z.array(z.object({
        name: z.string(),
        value: z.string(),
        domain: z.string().optional(),
        path: z.string().optional().default('/'),
        secure: z.boolean().optional().default(false),
        http_only: z.boolean().optional().default(false),
      })).describe('List of cookies to set'),
      token: z.string().optional(),
    },
    tool(async ({ cookies, token }) => {
      checkAuth(token);
      await ctx.page.setCookie(...cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.http_only,
      })));
      return { content: [{ type: 'text', text: `Set ${cookies.length} cookie(s)` }] };
    })
  );

  server.tool(
    'clear_cookies',
    'Clear all cookies for the current page',
    { token: z.string().optional() },
    tool(async ({ token }) => {
      checkAuth(token);
      const cookies = await ctx.page.cookies();
      await ctx.page.deleteCookie(...cookies);
      return { content: [{ type: 'text', text: `Cleared ${cookies.length} cookie(s)` }] };
    })
  );
}
