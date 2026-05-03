import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

export function registerScreenshot(server, ctx) {

  server.tool(
    'take_screenshot',
    'Take a screenshot of the current page or a specific element',
    {
      selector: z.string().optional().describe('CSS selector of element to screenshot (omit for full page)'),
      full_page: z.boolean().optional().default(false).describe('Capture full scrollable page (incompatible with selector)'),
      format: z.enum(['png', 'jpeg', 'webp']).optional().default('png'),
      quality: z.number().min(0).max(100).optional().describe('Compression quality for jpeg/webp (0-100)'),
      file_path: z.string().optional().describe('Save to this path instead of returning inline'),
      token: z.string().optional(),
    },
    tool(async ({ selector, full_page, format, quality, file_path, token }) => {
      checkAuth(token);
      const opts = {
        encoding: file_path ? undefined : 'base64',
        type: format,
        fullPage: !selector && full_page,
        ...(quality !== undefined && format !== 'png' ? { quality } : {}),
        ...(file_path ? { path: file_path } : {}),
      };

      let buf;
      if (selector) {
        const el = await ctx.page.waitForSelector(selector, { timeout: 10_000 });
        buf = await el.screenshot(opts);
      } else {
        buf = await ctx.page.screenshot(opts);
        await ctx.page.screenshot({ path: '/data/last.png', fullPage: full_page });
      }

      if (file_path) {
        return { content: [{ type: 'text', text: `Screenshot saved to: ${file_path}` }] };
      }
      return { content: [{ type: 'image', data: buf, mimeType: `image/${format}` }] };
    })
  );

  server.tool(
    'take_snapshot',
    'Take a text snapshot of the page accessibility tree — lists interactive elements with CSS selectors',
    {
      verbose: z.boolean().optional().default(false).describe('Include all a11y properties'),
      token: z.string().optional(),
    },
    tool(async ({ verbose, token }) => {
      checkAuth(token);
      const snapshot = await ctx.page.evaluate((verbose) => {
        const walk = (el, depth = 0) => {
          const tag = el.tagName?.toLowerCase() ?? '';
          const role = el.getAttribute?.('role') ?? '';
          const label = el.getAttribute?.('aria-label')
            ?? el.getAttribute?.('placeholder')
            ?? el.innerText?.slice(0, 60)
            ?? '';
          const id  = el.id ? `#${el.id}` : '';
          const cls = el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).join('.')
            : '';
          const selector = `${tag}${id}${cls}`.slice(0, 80);
          const indent = '  '.repeat(depth);
          const line = `${indent}<${tag}${role ? ` role="${role}"` : ''}${label ? ` label="${label}"` : ''}> ${selector}`;
          const children = verbose
            ? [...(el.children ?? [])].map(c => walk(c, depth + 1)).join('\n')
            : [...(el.querySelectorAll?.('a,button,input,select,textarea,[role="button"],[role="link"]') ?? [])]
                .map(c => walk(c, depth + 1)).join('\n');
          return children ? `${line}\n${children}` : line;
        };
        return walk(document.body);
      }, verbose);
      return { content: [{ type: 'text', text: snapshot }] };
    })
  );
}
