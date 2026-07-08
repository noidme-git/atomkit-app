# Changelog

All notable changes to `@noidmejs/atomkit-app`. Pre-1.0: minor versions may break.

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
