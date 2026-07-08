import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectRoutes,
  matchRoute,
  renderAqlSource,
  pageShell,
  loadConfig,
  build,
  create,
} from '../dist/index.js';

const tmp = mkdtempSync(join(tmpdir(), 'atomkit-app-'));
try {
  // --- create: scaffolds a runnable project ---
  create(tmp, 'demo');
  const proj = join(tmp, 'demo');
  assert.ok(existsSync(join(proj, 'app/index.aql')), 'scaffold writes app/index.aql');
  assert.ok(existsSync(join(proj, 'app/about.aql')), 'scaffold writes app/about.aql');
  assert.ok(existsSync(join(proj, 'atomkit.config.json')), 'scaffold writes config');
  const pkg = JSON.parse(readFileSync(join(proj, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.dev.includes('atomkit-app dev'), 'dev script wired');
  assert.ok(pkg.scripts.build.includes('atomkit-app build'), 'build script wired');
  assert.ok(pkg.devDependencies['@noidmejs/atomkit-app'], 'atomkit-app pinned as devDependency');

  // --- routing: file → route mapping ---
  const routes = collectRoutes(join(proj, 'app'));
  assert.deepEqual(routes.map((r) => r.route).sort(), ['/', '/about'], 'index→/ , about→/about');
  assert.ok(matchRoute(routes, '/about/'), 'trailing slash matches');
  assert.ok(!matchRoute(routes, '/missing'), 'unknown path → undefined');

  // --- SSR render + HTML shell ---
  const cfg = loadConfig(proj);
  const home = renderAqlSource(readFileSync(join(proj, 'app/index.aql'), 'utf8'), cfg);
  assert.equal(home.title, 'Home', 'page title comes from AQL');
  assert.ok(home.html.includes('Ship UI by writing AQL'), 'renders the heading text');
  const shell = pageShell({ title: home.title, description: home.description, bodyHtml: home.html, cfg });
  assert.ok(shell.startsWith('<!doctype html>'), 'shell is a full document');
  assert.ok(shell.includes('--brand:#005DAB'), 'design tokens injected into :root');
  assert.ok(shell.includes('<div id="app">'), 'body mounted');

  // --- governance: a PII node never reaches the served HTML ---
  const pii = renderAqlSource('page "P" {\n  text "secret@corp.com" pii\n}', cfg);
  assert.ok(!pii.html.includes('secret@corp.com'), 'PII value is masked in SSR output');

  // --- build: static HTML (deploy) + standalone React (own your code) ---
  build(proj);
  assert.ok(existsSync(join(proj, 'dist/index.html')), 'emits dist/index.html');
  assert.ok(existsSync(join(proj, 'dist/about/index.html')), 'emits dist/about/index.html');
  assert.ok(existsSync(join(proj, 'dist/components/Home.tsx')), 'emits components/Home.tsx');
  const tsx = readFileSync(join(proj, 'dist/components/Home.tsx'), 'utf8');
  assert.ok(tsx.includes('import * as React'), 'compiled component imports React');
  assert.ok(!tsx.includes('@noidmejs/atomkit'), 'compiled component has NO atomkit runtime dependency');
  assert.ok(existsSync(join(proj, 'dist/robots.txt')), 'public asset copied to dist');
  const manifest = JSON.parse(readFileSync(join(proj, 'dist/routes.json'), 'utf8'));
  assert.equal(manifest.length, 2, 'routes.json lists both pages');

  console.log('✓ atomkit-app tests passed (scaffold, routing, SSR, governance, build → HTML + standalone React)');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
