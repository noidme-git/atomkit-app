// The static server must not hand out developer artifacts.
//
// `build` writes the ejected React components into `dist/components/*.tsx`, and
// `start` serves everything under `dist/` with an `octet-stream` fallback for
// unknown extensions. So `GET /components/Home.tsx` returned 200 and your source.
//
// Benign today — those files hold only public content, because the compiler drops
// every governed node. It stops being benign the moment governed per-persona bundles
// exist: `Careers_admin.tsx` sitting in the deployable output, fetchable by anyone,
// containing the PII the whole product exists to withhold.
//
// This test drives the real server over real HTTP. It asserts the artifacts are
// unreachable AND that ordinary assets still are — a 404 for everything would also
// "pass" a one-sided test.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create, build, start } from '../dist/index.js';

const json = (obj) => new Response(JSON.stringify(obj), { headers: { 'content-type': 'application/json' } });
const tmp = mkdtempSync(join(tmpdir(), 'atomkit-serve-'));
let server;

try {
  create(tmp, 'demo');
  const proj = join(tmp, 'demo');
  await build(proj, { fetchImpl: async () => json({ name: 'Ada', company: { name: 'X' }, email: 'a@b.c' }) });

  // A source map and a stray .ts, to prove the extension rule and not just the dir rule.
  mkdirSync(join(proj, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(proj, 'dist', 'assets', 'app.js.map'), '{"version":3}');
  writeFileSync(join(proj, 'dist', 'assets', 'secret.ts'), 'export const TOKEN = "sk-live-xyz";');
  writeFileSync(join(proj, 'dist', 'assets', 'style.css'), 'body{color:red}');

  const port = 34117;
  server = start(proj, port);
  const base = `http://127.0.0.1:${port}`;

  // Wait for listen, bounded.
  for (let i = 0; i < 60; i++) {
    try { await fetch(base + '/'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  const status = async (path) => (await fetch(base + path)).status;
  const body = async (path) => (await fetch(base + path)).text();

  // ── The site still works ──────────────────────────────────────────────────
  assert.equal(await status('/'), 200, 'the home page must still be served');
  assert.ok((await body('/')).includes('<!doctype html>'), 'home page is HTML');
  assert.equal(await status('/about'), 200, 'clean URLs still resolve');
  assert.equal(await status('/robots.txt'), 200, 'public assets still served');
  assert.equal(await status('/assets/style.css'), 200, 'ordinary assets still served');

  // ── Developer artifacts are unreachable ───────────────────────────────────
  assert.equal(await status('/components/Home.tsx'), 404, 'ejected component must not be served');
  assert.equal(await status('/components/Data.tsx'), 404, 'ejected component must not be served');
  assert.equal(await status('/components/'), 404, 'the components directory must not be listed or served');
  assert.equal(await status('/assets/secret.ts'), 404, 'a .ts file must not be served');
  assert.equal(await status('/assets/app.js.map'), 404, 'a source map must not be served');

  // And nothing leaked in a body.
  assert.ok(!(await body('/components/Home.tsx')).includes('import * as React'), 'component source leaked');
  assert.ok(!(await body('/assets/secret.ts')).includes('sk-live-xyz'), 'a token leaked from a .ts file');

  // ── Path traversal is still blocked ───────────────────────────────────────
  assert.equal(await status('/../package.json'), 404);
  assert.equal(await status('/%2e%2e/package.json'), 404);

  console.log('✓ serve tests passed (site + assets served; components/, .ts, .tsx and .map unreachable; traversal blocked)');
} finally {
  server?.close?.();
  rmSync(tmp, { recursive: true, force: true });
  // The server holds the event loop open; nothing else is pending.
  setTimeout(() => process.exit(0), 50).unref();
}
