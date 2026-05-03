import { z } from 'zod';
import { checkAuth, tool } from '../auth.js';
import fs from 'fs';

export function registerMemory(server, ctx) {

  server.tool(
    'take_memory_snapshot',
    'Capture a JavaScript heap snapshot to analyze memory usage and debug leaks',
    {
      file_path: z.string().default('/data/heap.heapsnapshot')
        .describe('Path to save the .heapsnapshot file'),
      token: z.string().optional(),
    },
    tool(async ({ file_path, token }) => {
      checkAuth(token);
      const client = await ctx.page.createCDPSession();
      const chunks = [];

      await new Promise((resolve, reject) => {
        client.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => chunks.push(chunk));
        client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
          .then(resolve).catch(reject);
      });

      const snapshot = chunks.join('');
      fs.writeFileSync(file_path, snapshot);

      const sizeMB = (Buffer.byteLength(snapshot) / 1024 / 1024).toFixed(2);
      return { content: [{ type: 'text', text: `Heap snapshot saved to: ${file_path} (${sizeMB} MB)` }] };
    })
  );
}
