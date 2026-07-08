import { createServer, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, sep } from 'node:path';
import { loadConfig } from './config.js';
import { log, warn } from './log.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

/** Serve a prebuilt `dist/` (from `build`) with clean-URL resolution. */
export function start(cwd: string, portOverride?: number): void {
  const cfg = loadConfig(cwd);
  const port = portOverride ?? cfg.port;
  const outDir = join(cwd, cfg.outDir);
  if (!existsSync(join(outDir, 'index.html'))) {
    throw new Error(`No build found in ${cfg.outDir}/ — run \`atomkit-app build\` first.`);
  }

  const server = createServer((req, res) => {
    let path = '/';
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      path = '/';
    }
    const file = resolveFile(outDir, path);
    if (!file) return send(res, 404, 'text/html; charset=utf-8', notFoundBody());
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      warn(`port ${port} is in use — set a different one with --port`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(port, () => log(`atomkit-app start → http://localhost:${port}  (serving ${cfg.outDir}/)`));
}

// Map a URL path to a file inside outDir: try the literal file, then
// `<path>/index.html`, then `<path>.html`. Path-traversal guarded.
function resolveFile(outDir: string, path: string): string | undefined {
  const rel = normalize(path).replace(/^([/\\]|\.\.[/\\])+/, '');
  const base = join(outDir, rel);
  if (base !== outDir && !base.startsWith(outDir + sep)) return undefined;
  const candidates =
    path === '/' || path.endsWith('/')
      ? [join(base, 'index.html')]
      : [base, join(base, 'index.html'), `${base}.html`];
  return candidates.find((f) => existsSync(f) && statSync(f).isFile());
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

function notFoundBody(): string {
  return `<!doctype html><meta charset="utf-8"><title>404</title><body style="font-family:system-ui;padding:3rem;text-align:center"><h1>404</h1><p>Not found.</p></body>`;
}
