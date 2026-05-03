import { z } from 'zod';
import { checkAuth } from '../auth.js';
import fs from 'fs';

export function registerMemory(server, ctx) {

  // take_memory_snapshot — heap snapshot via CDP
  server.tool(
    'take_memory_snapshot',
    'Capture a JavaScript heap snapshot of the current page to analyze memory usage',
    {
      file_path: z.string().describe('Path to save the .heapsnapshot file, e.g. /data/heap.heapsnapshot'),
      token: z.string().optional(),
    },
    async ({ file_path, token }) => {
      checkAuth(token);
      const client = await ctx.page.createCDPSession();
      const chunks = [];

      await new Promise((resolve, reject) => {
        client.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => chunks.push(chunk));
        client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
          .then(resolve)
          .catch(reject);
      });

      const snapshot = chunks.join('');
      fs.writeFileSync(file_path, snapshot);

      const sizeMB = (Buffer.byteLength(snapshot) / 1024 / 1024).toFixed(2);
      return { content: [{ type: 'text', text: `Heap snapshot saved to: ${file_path} (${sizeMB} MB)` }] };
    }
  );
}
