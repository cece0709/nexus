import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    const requested = path.resolve(root, '.' + pathname);
    if (requested !== root && !requested.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    let file = requested;
    try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
    catch { res.writeHead(404); res.end('Not found'); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
  } catch { res.writeHead(500); res.end('Unable to serve prototype'); }
});
server.on('error', error => { console.error('Unable to start:', error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`NEXUS AI prototype: http://127.0.0.1:${port}\nKeep this window open. Press Ctrl+C to stop.\nDemo only: no microphone or cloud AI.`));
