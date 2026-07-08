import { createServer, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync, watch } from 'node:fs';
import { join, extname, normalize, sep } from 'node:path';
import { collectRoutes, matchRoute, type Route } from './router.js';
import { renderAqlSource } from './render.js';
import { pageShell } from './html.js';
import { loadConfig } from './config.js';
import { log, warn } from './log.js';

const MIME: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

/** Start the dev server: file-based routing over `.aql`, SSR, live reload. */
export function dev(cwd: string, portOverride?: number): void {
  const boot = loadConfig(cwd);
  const port = portOverride ?? boot.port;
  const appDir = join(cwd, boot.appDir);
  const publicDir = join(cwd, boot.publicDir);
  const clients = new Set<ServerResponse>();

  if (!existsSync(appDir)) {
    throw new Error(`No app directory at ${boot.appDir}/ — run \`atomkit-app create\` to scaffold a project.`);
  }

  const server = createServer((req, res) => {
    let path = '/';
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      path = '/';
    }

    // Live-reload SSE channel.
    if (path === '/__atomkit/reload') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // Static assets from public/.
    if (servePublic(publicDir, path, res)) return;

    // Route + render (async: pages may resolve data bindings). Any error → errorPage.
    void handlePage(cwd, appDir, path, res);
  });

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      warn(`port ${port} is in use — set a different one with --port or "port" in atomkit.config.json`);
      process.exit(1);
    }
    throw e;
  });

  server.listen(port, () => {
    log(`atomkit-app dev  →  http://localhost:${port}`);
    log(`  routing ${boot.appDir}/**/*.aql · live-reload on · Ctrl+C to stop`);
  });

  const reload = debounce(() => {
    for (const c of clients) c.write('data: reload\n\n');
  }, 80);
  watchTree(appDir, reload);
  watchTree(publicDir, reload);
  const cfgFile = join(cwd, 'atomkit.config.json');
  if (existsSync(cfgFile)) {
    try {
      watch(cfgFile, reload);
    } catch {
      /* ignore */
    }
  }
}

async function handlePage(cwd: string, appDir: string, path: string, res: ServerResponse): Promise<void> {
  let route: Route | undefined;
  try {
    // Re-read config each request so token/title/context/data edits show live.
    const cfg = loadConfig(cwd);
    const routes = collectRoutes(appDir);
    route = matchRoute(routes, path);
    if (!route) return notFound(res, routes);

    const src = readFileSync(route.file, 'utf8');
    const page = await renderAqlSource(src, cfg);
    for (const n of page.notes) warn(`${route.route} — ${n}`);
    const html = pageShell({
      title: page.title,
      description: page.description,
      bodyHtml: page.html,
      cfg,
      liveReload: true,
    });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  } catch (e) {
    errorPage(res, route?.route ?? path, e as Error);
  }
}

function servePublic(publicDir: string, path: string, res: ServerResponse): boolean {
  if (path === '/' || path.endsWith('/') || !existsSync(publicDir)) return false;
  const rel = normalize(path).replace(/^([/\\]|\.\.[/\\])+/, '');
  const file = join(publicDir, rel);
  // Path-traversal guard: the resolved file must stay inside publicDir.
  if (file !== publicDir && !file.startsWith(publicDir + sep)) return false;
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  res.end(readFileSync(file));
  return true;
}

function notFound(res: ServerResponse, routes: Route[]): void {
  const list = routes.map((r) => `<li><a href="${r.route}">${r.route}</a></li>`).join('');
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>404</title><body style="font-family:system-ui;padding:3rem;max-width:40rem;margin:auto">` +
      `<h1>404 — no route</h1><p>No <code>.aql</code> page matched. Known routes:</p><ul>${list}</ul></body>`,
  );
}

function errorPage(res: ServerResponse, route: string, e: Error): void {
  warn(`error rendering ${route}: ${e.message}`);
  res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>AQL error</title><body style="font-family:system-ui;padding:3rem;max-width:48rem;margin:auto;color:#0b1220">` +
      `<h1 style="color:#E31936">AQL error in ${escapeHtml(route)}</h1>` +
      `<pre style="background:#f7f9fc;padding:1rem;border-radius:8px;overflow:auto;white-space:pre-wrap">${escapeHtml(e.message)}</pre>` +
      `<p style="color:#525c6b">Fix the <code>.aql</code> and save — this page live-reloads.</p></body>`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function debounce(fn: () => void, ms: number): () => void {
  let t: NodeJS.Timeout | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

// Watch a directory tree. Prefers a recursive watch (macOS/Windows); on platforms
// without it (some Linux) falls back to a flat watch of the root.
function watchTree(dir: string, onChange: () => void): void {
  if (!existsSync(dir)) return;
  try {
    watch(dir, { recursive: true }, onChange);
  } catch {
    try {
      watch(dir, onChange);
    } catch {
      /* ignore — watching is best-effort */
    }
  }
}
