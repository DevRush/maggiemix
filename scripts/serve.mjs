#!/usr/bin/env node
// Tiny static server for local development and the smoke tests.
// Sends the same response headers as vercel.json so the CSP is exercised locally.
//   npm run serve            → http://localhost:8080
//   PORT=3000 npm run serve
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function loadHeaders() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    return (cfg.headers || []).map(h => ({ re: new RegExp('^' + h.source.replace(/\(\.\*\)/g, '.*') + '$'), headers: h.headers }));
  } catch { return []; }
}

export function startServer({ port = 0, dir = root } = {}) {
  const rules = loadHeaders();
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(dir, pathname));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    const headers = { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' };
    for (const rule of rules) if (rule.re.test(pathname)) for (const h of rule.headers) headers[h.key] = h.value;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { port } = await startServer({ port: Number(process.env.PORT) || 8080 });
  console.log(`MaggieMix → http://localhost:${port}/`);
}
