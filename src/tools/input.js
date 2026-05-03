import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

export function registerInput(server, ctx) {

  server.tool(
    'click',
    'Click an element on the page using a CSS selector',
    {
      selector: z.string().describe('CSS selector of the element to click'),
      dbl_click: z.boolean().optional().default(false).describe('Double-click instead of single click'),
      token: z.string().optional(),
    },
    tool(async ({ selector, dbl_click, token }) => {
      checkAuth(token);
      await ctx.page.waitForSelector(selector, { timeout: 10_000 });
      await ctx.page.click(selector, { clickCount: dbl_click ? 2 : 1 });
      return { content: [{ type: 'text', text: `Clicked: ${selector}` }] };
    })
  );

  server.tool(
    'hover',
    'Hover over an element using a CSS selector',
    {
      selector: z.string().describe('CSS selector of the element to hover'),
      token: z.string().optional(),
    },
    tool(async ({ selector, token }) => {
      checkAuth(token);
      await ctx.page.waitForSelector(selector, { timeout: 10_000 });
      await ctx.page.hover(selector);
      return { content: [{ type: 'text', text: `Hovered: ${selector}` }] };
    })
  );

  server.tool(
    'fill',
    'Type text into an input/textarea, or select an option from a <select> element',
    {
      selector: z.string().describe('CSS selector of the element'),
      value: z.string().describe('Value to fill in'),
      token: z.string().optional(),
    },
    tool(async ({ selector, value, token }) => {
      checkAuth(token);
      await ctx.page.waitForSelector(selector, { timeout: 10_000 });
      const tagName = await ctx.page.$eval(selector, el => el.tagName.toLowerCase());
      if (tagName === 'select') {
        await ctx.page.select(selector, value);
      } else {
        await ctx.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) { el.focus(); el.value = ''; }
        }, selector);
        await ctx.page.type(selector, value);
      }
      return { content: [{ type: 'text', text: `Filled "${value}" into: ${selector}` }] };
    })
  );

  server.tool(
    'fill_form',
    'Fill multiple form fields at once',
    {
      fields: z.array(z.object({
        selector: z.string(),
        value: z.string(),
      })).describe('List of selector+value pairs'),
      token: z.string().optional(),
    },
    tool(async ({ fields, token }) => {
      checkAuth(token);
      const results = [];
      for (const { selector, value } of fields) {
        await ctx.page.waitForSelector(selector, { timeout: 10_000 });
        const tagName = await ctx.page.$eval(selector, el => el.tagName.toLowerCase());
        if (tagName === 'select') {
          await ctx.page.select(selector, value);
        } else {
          await ctx.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) { el.focus(); el.value = ''; }
          }, selector);
          await ctx.page.type(selector, value);
        }
        results.push(`✓ ${selector} = "${value}"`);
      }
      return { content: [{ type: 'text', text: results.join('\n') }] };
    })
  );

  server.tool(
    'type_text',
    'Type text using the keyboard into the currently focused element',
    {
      text: z.string().describe('Text to type'),
      submit_key: z.string().optional().describe('Key to press after typing, e.g. "Enter", "Tab"'),
      token: z.string().optional(),
    },
    tool(async ({ text, submit_key, token }) => {
      checkAuth(token);
      await ctx.page.keyboard.type(text);
      if (submit_key) await ctx.page.keyboard.press(submit_key);
      return { content: [{ type: 'text', text: `Typed: "${text}"${submit_key ? ` + ${submit_key}` : ''}` }] };
    })
  );

  server.tool(
    'press_key',
    'Press a key or key combination (e.g. "Enter", "Control+A", "Control+Shift+R")',
    {
      key: z.string().describe('Key or combination, e.g. "Enter", "Control+A"'),
      token: z.string().optional(),
    },
    tool(async ({ key, token }) => {
      checkAuth(token);
      const parts = key.split('+');
      if (parts.length > 1) {
        const modifiers = parts.slice(0, -1);
        const mainKey = parts[parts.length - 1];
        for (const mod of modifiers) await ctx.page.keyboard.down(mod);
        await ctx.page.keyboard.press(mainKey);
        for (const mod of [...modifiers].reverse()) await ctx.page.keyboard.up(mod);
      } else {
        await ctx.page.keyboard.press(key);
      }
      return { content: [{ type: 'text', text: `Pressed: ${key}` }] };
    })
  );

  server.tool(
    'drag',
    'Drag an element onto another element using CSS selectors',
    {
      from_selector: z.string().describe('CSS selector of the element to drag'),
      to_selector: z.string().describe('CSS selector of the drop target'),
      token: z.string().optional(),
    },
    tool(async ({ from_selector, to_selector, token }) => {
      checkAuth(token);
      const fromEl = await ctx.page.waitForSelector(from_selector, { timeout: 10_000 });
      const toEl   = await ctx.page.waitForSelector(to_selector,   { timeout: 10_000 });
      const fromBox = await fromEl.boundingBox();
      const toBox   = await toEl.boundingBox();
      if (!fromBox || !toBox) throw new Error('Could not get bounding box for drag elements');
      await ctx.page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
      await ctx.page.mouse.down();
      await ctx.page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 });
      await ctx.page.mouse.up();
      return { content: [{ type: 'text', text: `Dragged ${from_selector} → ${to_selector}` }] };
    })
  );

  server.tool(
    'handle_dialog',
    'Accept or dismiss a browser dialog (alert, confirm, prompt)',
    {
      action: z.enum(['accept', 'dismiss']),
      prompt_text: z.string().optional().describe('Text to enter into a prompt dialog'),
      token: z.string().optional(),
    },
    tool(async ({ action, prompt_text, token }) => {
      checkAuth(token);
      await new Promise((resolve, reject) => {
        const handler = async (dialog) => {
          try {
            if (action === 'accept') await dialog.accept(prompt_text ?? '');
            else await dialog.dismiss();
            resolve();
          } catch (e) { reject(e); }
        };
        ctx.page.once('dialog', handler);
        setTimeout(() => { ctx.page.off('dialog', handler); resolve(); }, 10_000);
      });
      return { content: [{ type: 'text', text: `Dialog ${action}ed` }] };
    })
  );

  server.tool(
    'upload_file',
    'Upload a file through a file input element',
    {
      selector: z.string().describe('CSS selector of the file input element'),
      file_path: z.string().describe('Absolute path to the file to upload'),
      token: z.string().optional(),
    },
    tool(async ({ selector, file_path, token }) => {
      checkAuth(token);
      const input = await ctx.page.waitForSelector(selector, { timeout: 10_000 });
      await input.uploadFile(file_path);
      return { content: [{ type: 'text', text: `Uploaded ${file_path} to: ${selector}` }] };
    })
  );

  // #6 — scroll tool
  server.tool(
    'scroll',
    'Scroll the page or a specific element',
    {
      direction: z.enum(['up', 'down', 'left', 'right', 'top', 'bottom']).default('down'),
      amount: z.number().optional().default(500).describe('Pixels to scroll (ignored for top/bottom)'),
      selector: z.string().optional().describe('CSS selector of element to scroll (omit for page)'),
      token: z.string().optional(),
    },
    tool(async ({ direction, amount, selector, token }) => {
      checkAuth(token);
      await ctx.page.evaluate((dir, px, sel) => {
        const el = sel ? document.querySelector(sel) : window;
        if (!el) throw new Error(`Element not found: ${sel}`);
        const scrollMap = {
          up:     () => el.scrollBy(0, -px),
          down:   () => el.scrollBy(0, px),
          left:   () => el.scrollBy(-px, 0),
          right:  () => el.scrollBy(px, 0),
          top:    () => el.scrollTo(0, 0),
          bottom: () => el.scrollTo(0, el.scrollHeight ?? document.body.scrollHeight),
        };
        scrollMap[dir]();
      }, direction, amount, selector ?? null);
      return { content: [{ type: 'text', text: `Scrolled ${direction}${amount && !['top','bottom'].includes(direction) ? ` ${amount}px` : ''}` }] };
    })
  );
}
