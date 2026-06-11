import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PREVIEW_INDEX = '/.previews/index.html';
const PORT = Number(process.env.PREVIEW_PORT) || 3847;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function resolveFilePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0]);
  const relative = pathname === '/' ? PREVIEW_INDEX : pathname;
  const filePath = path.normalize(path.join(ROOT, relative.replace(/^\//, '')));

  if (!filePath.startsWith(ROOT)) return null;
  return filePath;
}

function openInBrowser(url) {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

const indexPath = path.join(ROOT, '.previews', 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('Missing .previews/index.html — run: node scripts/generate-panel-previews.mjs');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const filePath = resolveFilePath(req.url || '/');
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}${PREVIEW_INDEX}`;
  console.log(`Panel previews: ${url}`);
  console.log('Serving repo root (so panel CSS loads). Press Ctrl+C to stop.');
  openInBrowser(url);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Try: PREVIEW_PORT=${PORT + 1} npm run previews`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});
