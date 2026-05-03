import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';

export function registerEmulation(server, ctx) {

  server.tool(
    'emulate',
    'Emulate device features: color scheme, viewport, user agent, network conditions, CPU throttling',
    {
      color_scheme: z.enum(['dark', 'light', 'auto']).optional(),
      viewport: z.string().optional().describe('Format: "<width>x<height>" e.g. "375x812"'),
      user_agent: z.string().optional().describe('Empty string resets to default'),
      network_conditions: z.enum(['Offline', 'Slow 3G', 'Fast 3G', 'Slow 4G', 'Fast 4G']).optional(),
      cpu_throttling_rate: z.number().optional().describe('CPU slowdown factor. 1 = no throttling.'),
      token: z.string().optional(),
    },
    tool(async ({ color_scheme, viewport, user_agent, network_conditions, cpu_throttling_rate, token }) => {
      checkAuth(token);
      const client = await ctx.page.createCDPSession();
      const applied = [];

      if (color_scheme) {
        await ctx.page.emulateMediaFeatures([{
          name: 'prefers-color-scheme',
          value: color_scheme === 'auto' ? '' : color_scheme,
        }]);
        applied.push(`color_scheme=${color_scheme}`);
      }

      if (viewport) {
        const [w, h] = viewport.split('x').map(Number);
        await ctx.page.setViewport({ width: w, height: h });
        applied.push(`viewport=${viewport}`);
      }

      if (user_agent !== undefined) {
        await ctx.page.setUserAgent(user_agent);
        applied.push(`user_agent=${user_agent || '(reset)'}`);
      }

      if (network_conditions) {
        const profiles = {
          'Offline':  { offline: true,  downloadThroughput: 0,          uploadThroughput: 0,          latency: 0 },
          'Slow 3G':  { offline: false, downloadThroughput: 50_000,      uploadThroughput: 50_000,      latency: 2000 },
          'Fast 3G':  { offline: false, downloadThroughput: 180_000,     uploadThroughput: 84_000,      latency: 562 },
          'Slow 4G':  { offline: false, downloadThroughput: 4_000_000,   uploadThroughput: 3_000_000,   latency: 20 },
          'Fast 4G':  { offline: false, downloadThroughput: 30_000_000,  uploadThroughput: 15_000_000,  latency: 2 },
        };
        await client.send('Network.emulateNetworkConditions', profiles[network_conditions]);
        applied.push(`network=${network_conditions}`);
      }

      if (cpu_throttling_rate !== undefined) {
        await client.send('Emulation.setCPUThrottlingRate', { rate: cpu_throttling_rate });
        applied.push(`cpu_throttling=${cpu_throttling_rate}x`);
      }

      return { content: [{ type: 'text', text: `Applied: ${applied.join(', ') || 'nothing'}` }] };
    })
  );

  server.tool(
    'resize_page',
    'Resize the browser window to the specified dimensions',
    {
      width: z.number().int(),
      height: z.number().int(),
      token: z.string().optional(),
    },
    tool(async ({ width, height, token }) => {
      checkAuth(token);
      await ctx.page.setViewport({ width, height });
      return { content: [{ type: 'text', text: `Resized to ${width}x${height}` }] };
    })
  );
}
