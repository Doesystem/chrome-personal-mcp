import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';
import fs from 'fs';

let activeTraceClient = null;

export function registerPerformance(server, ctx) {

  server.tool(
    'performance_start_trace',
    'Start a performance trace on the current page',
    {
      reload: z.boolean().optional().default(false).describe('Reload the page after starting the trace'),
      token: z.string().optional(),
    },
    tool(async ({ reload, token }) => {
      checkAuth(token);
      if (activeTraceClient) throw new Error('A trace is already running — stop it first');

      activeTraceClient = await ctx.page.createCDPSession();
      await activeTraceClient.send('Tracing.start', {
        transferMode: 'ReturnAsStream',
        traceConfig: {
          recordMode: 'recordAsMuchAsPossible',
          includedCategories: [
            'devtools.timeline',
            'v8.execute',
            'disabled-by-default-devtools.timeline',
            'disabled-by-default-devtools.timeline.frame',
            'disabled-by-default-v8.cpu_profiler',
          ],
        },
      });

      if (reload) await ctx.page.reload({ waitUntil: 'networkidle2' });
      return { content: [{ type: 'text', text: `Trace started${reload ? ' (page reloaded)' : ''}` }] };
    })
  );

  server.tool(
    'performance_stop_trace',
    'Stop the active performance trace and save to a file',
    {
      file_path: z.string().optional().default('/data/trace.json')
        .describe('Path to save raw trace JSON'),
      token: z.string().optional(),
    },
    tool(async ({ file_path, token }) => {
      checkAuth(token);
      if (!activeTraceClient) throw new Error('No active trace — start one first');

      const traceData = await new Promise((resolve, reject) => {
        const chunks = [];
        activeTraceClient.on('Tracing.dataCollected', ({ value }) => chunks.push(...value));
        activeTraceClient.on('Tracing.tracingComplete', () => resolve(chunks));
        activeTraceClient.send('Tracing.end').catch(reject);
      });

      activeTraceClient = null;

      fs.writeFileSync(file_path, JSON.stringify({ traceEvents: traceData }, null, 2));

      const categories = {};
      for (const e of traceData) categories[e.cat] = (categories[e.cat] ?? 0) + 1;
      const summary = Object.entries(categories)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([cat, count]) => `  ${cat}: ${count} events`).join('\n');

      return { content: [{ type: 'text', text: `Trace saved to: ${file_path}\n\nTop categories:\n${summary}` }] };
    })
  );

  server.tool(
    'performance_analyze_insight',
    'Get performance metrics for the current page (TTFB, FCP, DOMContentLoaded, Load)',
    { token: z.string().optional() },
    tool(async ({ token }) => {
      checkAuth(token);
      const metrics = await ctx.page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime ?? null;
        return {
          ttfb: nav ? nav.responseStart - nav.requestStart : null,
          fcp,
          domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
          loadTime: nav ? nav.loadEventEnd - nav.startTime : null,
        };
      });

      const fmt = v => v != null ? `${Math.round(v)}ms` : 'N/A';
      const text = [
        `TTFB:             ${fmt(metrics.ttfb)}`,
        `FCP:              ${fmt(metrics.fcp)}`,
        `DOMContentLoaded: ${fmt(metrics.domContentLoaded)}`,
        `Load:             ${fmt(metrics.loadTime)}`,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    })
  );
}
