import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const webRoot = process.env.WEB_ROOT ?? '/usr/share/nginx/html';
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://api:8081';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function safeJoin(root, targetPath) {
  const sanitized = targetPath.replace(/^\/+/, '');
  const resolved = path.resolve(root, sanitized || 'index.html');
  if (!resolved.startsWith(path.resolve(root))) {
    return path.resolve(root, 'index.html');
  }
  return resolved;
}

async function proxyRequest(req, res) {
  const url = new URL(req.url, apiProxyTarget);
  const hasRequestBody = req.method !== 'GET' && req.method !== 'HEAD';
  const bodyBuffer = hasRequestBody
    ? await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      })
    : undefined;
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([, value]) => typeof value === 'string'));
  if (bodyBuffer) {
    headers['content-length'] = String(bodyBuffer.length);
  } else {
    delete headers['content-length'];
  }
  const response = await fetch(url, {
    method: req.method,
    headers: {
      ...headers,
      host: new URL(apiProxyTarget).host,
    },
    body: bodyBuffer,
  });

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    for await (const chunk of response.body) {
      res.write(chunk);
    }
  }
  res.end();
}

async function serveFile(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`).pathname;
  const filePath = safeJoin(webRoot, pathname === '/' ? '/index.html' : pathname);

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes.get(ext) ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    const fallback = await readFile(path.resolve(webRoot, 'index.html'));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(fallback);
  }
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end('bad request');
    return;
  }

  if (req.url.startsWith('/api/') || req.url === '/healthz') {
    void proxyRequest(req, res).catch((error) => {
      console.error('[web] proxy failed', error);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'web proxy failed' }));
    });
    return;
  }

  void serveFile(req, res).catch((error) => {
    console.error('[web] static serve failed', error);
    res.writeHead(500).end('internal error');
  });
});

server.listen(port, () => {
  console.log(`[web] listening on ${port}`);
});
