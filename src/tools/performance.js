import { z } from 'zod';
import { checkAuth } from '../auth.js';
import fs from 'fs';

let activeTraceClient = null;

export function registerPerformance(server, ctx) {

  // performance_start_trace
  server.tool(
    'performance_start_trace',
    'Start a performance trace on the current page',
    {
      reload: z.boolean().optional().default(false)
        .describe('Reload the page after starting the trace'),
      file_path: z.string().optional()
        .describe('Path to save raw trace JSON, e.g. /data/trace.json'),
      token: z.string().optional(),
    },
    async ({ reload, file_path, token }) => {
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
    }
  );

  // performance_stop_trace
  server.tool(
    'performance_stop_trace',
    'Stop the active performance trace and return a summary',
    {
      file_path: z.string().optional()
        .describe('Path to save raw trace JSON, e.g. /data/trace.json'),
      token: z.string().optional(),
    },
    async ({ file_path, token }) => {
      checkAuth(token);
      if (!activeTraceClient) throw new Error('No active trace — start one first');

      const traceData = await new Promise((resolve, reject) => {
        const chunks = [];
        activeTraceClient.on('Tracing.dataCollected', ({ value }) => chunks.push(...value));
        activeTraceClient.on('Tracing.tracingComplete', () => resolve(chunks));
        activeTraceClient.send('Tracing.end').catch(reject);
      });

      activeTraceClient = null;

      const json = JSON.stringify({ traceEvents: traceData }, null, 2);
      const savePath = file_path ?? '/data/trace.json';
      fs.writeFileSync(savePath, json);

      // Basic summary: count event categories
      const categories = {};
      for (const e of traceData) {
        categories[e.cat] = (categories[e.cat] ?? 0) + 1;
      }
      const summary = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cat, count]) => `  ${cat}: ${count} events`)
        .join('\n');

      return { content: [{ type: 'text', text: `Trace saved to: ${savePath}\n\nTop event categories:\n${summary}` }] };
    }
  );

  // performance_analyze_insight — basic metrics from the page
  server.tool(
    'performance_analyze_insight',
    'Get performance metrics for the current page (LCP, FCP, CLS, TTFB)',
    {
      token: z.string().optional(),
    },
    async ({ token }) => {
      checkAuth(token);
      const metrics = await ctx.page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime ?? null;
        const lcp = (() => {
          try {
            return new Promise(resolve => {
              new PerformanceObserver(list => {
                const entries = list.getEntries();
                resolve(entries[entries.length - 1]?.startTime ?? null);
              }).observe({ type: 'largest-contentful-paint', buffered: true });
              setTimeout(() => resolve(null), 1000);
            });
          } catch { return null; }
        })();
        return {
          ttfb: nav ? nav.responseStart - nav.requestStart : null,
          fcp,
          domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
          loadTime: nav ? nav.loadEventEnd - nav.startTime : null,
        };
      });

      const fmt = (v) => v != null ? `${Math.round(v)}ms` : 'N/A';
      const text = [
        `TTFB:              ${fmt(metrics.ttfb)}`,
        `FCP:               ${fmt(metrics.fcp)}`,
        `DOMContentLoaded:  ${fmt(metrics.domContentLoaded)}`,
        `Load:              ${fmt(metrics.loadTime)}`,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );
}
