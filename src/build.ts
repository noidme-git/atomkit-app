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
import { log, ok, warn } from './log.js';

export interface BuildResult {
  routes: { route: string; html: string; component: string }[];
  outDir: string;
}

export interface BuildOptions {
  /** Output directory override (default cfg.outDir). */
  out?: string;
  /** Override fetch for data resolution (tests / custom runtimes). */
  fetchImpl?: typeof fetch;
}

/**
 * Build the app. For every `.aql` page it emits BOTH:
 *   1. `components/<Name>.tsx` — standalone React you own (via atomkit-compiler),
 *      no runtime lock-in. This is the "eject to code" artifact.
 *   2. static HTML (SSR via the atomkit runtime, governance enforced at egress) —
 *      the deployable site. `atomkit-app start` serves it.
 * `public/` is copied verbatim; a `routes.json` manifest is written.
 */
export async function build(cwd: string, opts: BuildOptions = {}): Promise<BuildResult> {
  const cfg = loadConfig(cwd);
  const appDir = join(cwd, cfg.appDir);
  const outDir = join(cwd, opts.out ?? cfg.outDir);
  const routes = collectRoutes(appDir);
  if (!routes.length) throw new Error(`No .aql pages found in ${cfg.appDir}/`);

  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  const componentsDir = join(outDir, 'components');
  mkdirSync(componentsDir, { recursive: true });

  log(`atomkit-app build → ${routes.length} page(s)\n`);
  const manifest: BuildResult['routes'] = [];
  for (const r of routes) {
    const src = readFileSync(r.file, 'utf8');

    // (1) own-your-code: standalone React (TSX). The compiled component is STATIC — it
    //     does NOT fetch. A data-bound node renders its authored fallback forever, and
    //     responsive overrides + the `video` atom are dropped. (An earlier note here
    //     claimed the ejected component "keeps the runtime's client-side fetch"; codegen
    //     never emitted one.) Every divergence from the runtime is surfaced by onWarn and
    //     recorded in the emitted file's header. The static HTML below bakes data at
    //     build time under the allow-list instead.
    const tsx = compileToReact(src, {
      name: r.name,
      onWarn: (w) => warn(`${r.route} — components/${r.name}.tsx: node ${w.node} (${w.type}): ${w.reason}`),
    });
    writeFileSync(join(componentsDir, `${r.name}.tsx`), tsx);

    // (2) deployable static HTML (data bindings resolved + baked, SSRF-guarded).
    const page = await renderAqlSource(src, cfg, { fetchImpl: opts.fetchImpl });
    for (const n of page.notes) warn(`${r.route} — ${n}`);
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
  log(`\nOutput → ${opts.out ?? cfg.outDir}/  (static HTML to deploy + components/*.tsx to own)`);
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
