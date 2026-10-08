// Serves the finished build (npx ng build) the way Render's static site does: the files as they are, and
// index.html for every page address. Used to try the installable app and its service worker, which `ng serve`
// cannot show (it changes index.html). There is no API here: /api answers 503.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist', 'inventory-project', 'browser');
const port = Number(process.env.PORT || 4400);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain'
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith('/api/') || path.startsWith('/uploads/')) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end('{"message":"No API on this test server"}');
  }
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    if (!(await stat(file)).isFile()) throw new Error('folder');
  } catch {
    file = join(root, 'index.html'); // a page address: the app's start page, like Render's "/* -> /index.html"
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Nothing here. Build the site first: npx ng build');
  }
}).listen(port, () => console.log(`Built site on http://localhost:${port}`));
