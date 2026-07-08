import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface Route {
  /** URL path, e.g. `/`, `/about`, `/blog/post`. */
  route: string;
  /** Absolute path to the `.aql` source. */
  file: string;
  /** PascalCase component name for compiled output. */
  name: string;
}

/**
 * File-based routing: every `app/**​/*.aql` becomes a route, Next-style —
 * `index.aql` → the directory root, others → their filename.
 *   app/index.aql        → /
 *   app/about.aql        → /about
 *   app/blog/index.aql   → /blog
 *   app/blog/post.aql    → /blog/post
 */
export function collectRoutes(appDir: string): Route[] {
  const routes: Route[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue; // _partials / dotfiles skipped
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.endsWith('.aql')) routes.push(toRoute(appDir, full));
    }
  };
  walk(appDir);
  // Deterministic order: `/` first, then alphabetical.
  return routes.sort((a, b) =>
    a.route === '/' ? -1 : b.route === '/' ? 1 : a.route.localeCompare(b.route),
  );
}

function toRoute(appDir: string, file: string): Route {
  const rel = relative(appDir, file).split(sep).join('/').replace(/\.aql$/, '');
  let route = ('/' + rel).replace(/\/index$/, '');
  if (route === '') route = '/';
  return { route, file, name: componentName(rel) };
}

function componentName(rel: string): string {
  const words = rel.replace(/\/?index$/, ' home').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/);
  const camel = words.filter(Boolean).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return /^[A-Za-z]/.test(camel) ? camel : `Page${camel}`;
}

/** Resolve a URL path to a route (trailing slashes ignored). */
export function matchRoute(routes: Route[], urlPath: string): Route | undefined {
  const clean = urlPath.replace(/\/+$/, '') || '/';
  return routes.find((r) => r.route === clean);
}
