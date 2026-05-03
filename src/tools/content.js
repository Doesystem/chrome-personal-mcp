import { z } from 'zod';
import { checkAuth } from '../auth.js';

export function registerContent(server, ctx) {

  // get_content — page text or HTML
  server.tool(
    'get_content',
    'Get the text content or full HTML of the current page',
    {
      format: z.enum(['text', 'html']).optional().default('text'),
      token: z.string().optional(),
    },
    async ({ format, token }) => {
      checkAuth(token);
      const content = format === 'html'
        ? await ctx.page.content()
        : await ctx.page.evaluate(() => document.body.innerText);
      return { content: [{ type: 'text', text: content }] };
    }
  );

  // current_url
  server.tool(
    'current_url',
    'Get the current URL and title of the active browser tab',
    { token: z.string().optional() },
    async ({ token }) => {
      checkAuth(token);
      const url   = ctx.page.url();
      const title = await ctx.page.title();
      return { content: [{ type: 'text', text: `URL: ${url}\nTitle: ${title}` }] };
    }
  );
}
