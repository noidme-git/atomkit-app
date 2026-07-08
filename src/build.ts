import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { collectRoutes } from './router.js';
import { renderAqlSource } from './render.js';
import { pageShell } from './html.js';
import { loadConfig } from './config.js';
import { compileToReact } from '@noidmejs/atomkit-compiler';
import { log, ok } from './log.js';

export interface BuildResult {
  routes: { route: string; html: string; component: string }[];
  outDir: string;
}

/**
 * Build the app. For every `.aql` page it emits BOTH:
 *   1. `components/<Name>.tsx` — standalone React you own (via atomkit-compiler),
 *      no runtime lock-in. This is the "eject to code" artifact.
 *   2. static HTML (SSR via the atomkit runtime, governance enforced at egress) —
 *      the deployable site. `atomkit-app start` serves it.
 * `public/` is copied verbatim; a `routes.json` manifest is written.
 */
export function build(cwd: string, outOverride?: string): BuildResult {
  const cfg = loadConfig(cwd);
  const appDir = join(cwd, cfg.appDir);
  const outDir = join(cwd, outOverride ?? cfg.outDir);
  const routes = collectRoutes(appDir);
  if (!routes.length) throw new Error(`No .aql pages found in ${cfg.appDir}/`);

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  const componentsDir = join(outDir, 'components');
  mkdirSync(componentsDir, { recursive: true });

  log(`atomkit-app build → ${routes.length} page(s)\n`);
  const manifest: BuildResult['routes'] = [];
  for (const r of routes) {
    const src = readFileSync(r.file, 'utf8');

    // (1) own-your-code: standalone React (TSX).
    const tsx = compileToReact(src, { name: r.name });
    writeFileSync(join(componentsDir, `${r.name}.tsx`), tsx);

    // (2) deployable static HTML.
    const page = renderAqlSource(src, cfg);
    const htmlPath = htmlOut(outDir, r.route);
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(
      htmlPath,
      pageShell({ title: page.title, description: page.description, bodyHtml: page.html, cfg, liveReload: false }),
    );

    const htmlRel = relative(outDir, htmlPath).split(/[/\\]/).join('/');
    manifest.push({ route: r.route, html: htmlRel, component: `components/${r.name}.tsx` });
    ok(`${r.route.padEnd(16)} → ${htmlRel}  +  components/${r.name}.tsx`);
  }

  // Copy static assets verbatim.
  const publicDir = join(cwd, cfg.publicDir);
  if (existsSync(publicDir)) copyDir(publicDir, outDir);

  writeFileSync(join(outDir, 'routes.json'), JSON.stringify(manifest, null, 2));
  log(`\nOutput → ${outOverride ?? cfg.outDir}/  (static HTML to deploy + components/*.tsx to own)`);
  return { routes: manifest, outDir };
}

function htmlOut(outDir: string, route: string): string {
  return route === '/' ? join(outDir, 'index.html') : join(outDir, route.slice(1), 'index.html');
}

function copyDir(from: string, to: string): void {
  for (const entry of readdirSync(from)) {
    const src = join(from, entry);
    const dst = join(to, entry);
    if (statSync(src).isDirectory()) {
      mkdirSync(dst, { recursive: true });
      copyDir(src, dst);
    } else {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }
}
