import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

export function registerEvaluate(server, ctx) {

  server.tool(
    'evaluate_script',
    'Execute a JavaScript function in the browser page context and return the JSON result',
    {
      function: z.string().describe('A JS function declaration, e.g. "() => document.title"'),
      args: z.array(z.unknown()).optional().describe('Arguments to pass to the function'),
      token: z.string().optional(),
    },
    tool(async ({ function: fn, args, token }) => {
      checkAuth(token);
      // eslint-disable-next-line no-new-func
      const result = await ctx.page.evaluate(
        new Function(`return (${fn})`)(),
        ...(args ?? [])
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    })
  );
}
