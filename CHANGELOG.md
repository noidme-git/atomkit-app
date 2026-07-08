# Changelog

All notable changes to `@noidmejs/atomkit-app`. Pre-1.0: minor versions may break.

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
