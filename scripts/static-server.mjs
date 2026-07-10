// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/scripts/static-server.mjs
// Description: Zero-dependency static HTTP server that serves the production `dist/` the way the
//   Verpex shared host will (Apache + a SPA .htaccess). It exists so the @smoke Playwright suite
//   and the PWA curl probes run against a REAL HTTP artifact server on this device, catching the
//   deploy-artifact problems that `vite preview` masks: SPA-fallback routing, .webmanifest MIME,
//   service-worker MIME + cache scope. This is the local mirror of the Verpex .htaccess contract
//   (AGENTS.md §5: document root = the one falamadeira.searchingfool.com dir; SPA needs an
//   .htaccess-style fallback). Behavior it enforces, which the deploy step MUST replicate:
//     (a) unknown paths (no file, no extension) -> serve index.html with 200 (SPA fallback);
//     (b) `.webmanifest` -> `application/manifest+json`;
//     (c) `.js`/`.mjs` -> `text/javascript`;
//     (d) `sw.js`, `registerSW.js`, `index.html`, `manifest.webmanifest` -> `no-cache` (must
//         revalidate so a new deploy is picked up); hashed `/assets/*` -> long immutable cache;
//     (e) real HTTP, no bundler, no dev middleware.
//   Path traversal is rejected. Node core `http`/`fs` only — no npm install.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-10

import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { extname, join, normalize, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(process.env.SERVE_DIR || join(__dirname, '..', 'dist'));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

// MIME map. Deliberately explicit for the deploy-critical types (.webmanifest, .js/.mjs) so this
// never silently drifts to a host default (e.g. Apache emitting `.webmanifest` as text/plain,
// which makes the browser reject the manifest).
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

// Files that must never be cached long-term: the SW, its registrar, the shell, and the manifest.
// A stale sw.js/index.html on a shared host is the classic "users stuck on the old build" bug.
const NO_CACHE = new Set(['sw.js', 'registerSW.js', 'index.html', 'manifest.webmanifest']);

function contentType(filePath) {
  return MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function cacheControl(filePath) {
  const name = basename(filePath);
  if (NO_CACHE.has(name)) return 'no-cache, must-revalidate';
  // Vite emits content-hashed filenames under /assets — safe to cache forever.
  if (filePath.includes(`${sep}assets${sep}`)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

async function statFile(p) {
  try {
    const s = await fs.stat(p);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

async function send(res, filePath, status = 200) {
  const stat = await fs.stat(filePath);
  res.writeHead(status, {
    'Content-Type': contentType(filePath),
    'Content-Length': stat.size,
    'Cache-Control': cacheControl(filePath),
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    // Normalize + reject path traversal escaping ROOT (mirrors what a hardened host does).
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safe);
    if (!resolve(filePath).startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    // Directory or root -> index.html of that dir.
    if (pathname.endsWith('/')) filePath = join(filePath, 'index.html');

    let stat = await statFile(filePath);

    if (stat) {
      return await send(res, filePath);
    }

    // No file at that path. SPA-fallback rule (mirrors the Verpex .htaccess):
    // requests for a real asset (has an extension) that don't exist -> 404;
    // everything else (client-side routes like /practice) -> index.html shell with 200.
    const hasExtension = extname(pathname) !== '';
    if (hasExtension) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const shell = join(ROOT, 'index.html');
    if (await statFile(shell)) {
      // 200 on the shell — the SPA router resolves the route client-side.
      return await send(res, shell, 200);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found (no index.html — did you run `npm run build`?)');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`500 Internal Server Error: ${err && err.message ? err.message : err}`);
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console -- server lifecycle log, not an app error path
  console.log(`[static-server] serving ${ROOT} at http://${HOST}:${PORT} (SPA fallback + Verpex MIME)`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
