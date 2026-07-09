# @noidmejs/atomkit-app

**The AQL app framework + generator.** Scaffold, dev-serve, and build a UI app
written entirely in [AQL](https://www.npmjs.com/package/@noidmejs/atomkit) — like
`create-next-app`, for atomkit. File-based routing over `.aql` pages, SSR to static
HTML, live reload, and compile-to-React so you can **own your code**.

```bash
npx @noidmejs/atomkit-app create my-app
cd my-app
npm install
npm run dev        # → http://localhost:3300
```

## The pipeline

```
app/index.aql ──┐   dev  → SSR (atomkit runtime) → http://localhost:3300 + live reload
app/about.aql ──┼─▶ build→ static HTML (deploy)  +  components/*.tsx (standalone React you own)
public/*        ┘   start→ serve the built site
```

- **`create [dir]`** — scaffold a project (`app/`, `atomkit.config.json`, `public/`).
- **`dev [--port N]`** — dev server: file-based routing, server-rendered, hot reload. Default `:3300`.
- **`build [--out D]`** — compile every `.aql` to **static HTML** (via the atomkit runtime, governance enforced) *and* a **standalone React component** (via [`@noidmejs/atomkit-compiler`](https://www.npmjs.com/package/@noidmejs/atomkit-compiler), no runtime lock-in).
- **`start [--port N]`** — static-serve the build.

## Project structure

```
my-app/
  app/                 file-based routing — each .aql is a route
    index.aql          →  /
    about.aql          →  /about
    data.aql           →  /data   (server-resolved data-binding demo)
    blog/post.aql      →  /blog/post
  public/              static assets served verbatim
  atomkit.config.json  title, port, design tokens, governance, data allowHosts
```

Files/dirs starting with `_` or `.` in `app/` are skipped (use them for partials).

## Config — `atomkit.config.json`

```json
{
  "title": "My atomkit app",
  "port": 3300,
  "lang": "en",
  "tokens": { "--brand": "#005DAB", "--ink": "#0b1220" },
  "context": { "canViewProtected": false, "canViewPii": false, "roles": [], "analytics": false }
}
```

`tokens` become `:root { … }` custom properties. `context` is the **public
viewer's** governance facts — the defaults are least-privileged, so a served page
can never leak `protected` / `pii` content. Editing the config hot-reloads in `dev`.

## Data binding — connect a backend by config

Bind any node to an API directly in AQL:

```
text "Loading…" api="https://api.example.com/thing" path=data.field bind=text
```

The value is fetched **on the server at build/dev time** through
[`@noidmejs/atomkit-http`](https://www.npmjs.com/package/@noidmejs/atomkit-http)
and **baked into the static HTML** — the deployed page ships no client JS. Add
`data` to `atomkit.config.json`:

```json
{
  "data": {
    "allowHosts": ["api.example.com"],
    "secrets": { "API_TOKEN": "…" },
    "timeoutMs": 5000
  }
}
```

- **`allowHosts`** is an SSRF allow-list (exact host or `.suffix`). A binding whose
  host isn't listed — or a private/reserved IP (`localhost`, `169.254.169.254`, LAN)
  — is **never fetched**; the authored fallback text renders instead. Empty list ⇒
  nothing is fetched (fail-closed).
- **`secrets`** is a curated server-only map referenced as `{{secret.NAME}}` in a
  URL/header — never the whole environment. Only the field selected by `path` is
  baked into HTML, never the secret.
- Fetch failure, an empty result, or a non-scalar value all fall back to the
  authored text (with a build/dev note). A node flagged **`pii`** is masked and
  never fetched (governance runs before resolution).

Data is a **build-time snapshot** — rebuild to refresh. The scaffolded `/data` page
is a live demo (binds to `jsonplaceholder.typicode.com`).

> **Note — two data behaviours from one build.** The deployable static HTML bakes
> the value at build time under the allow-list. The ejected `components/*.tsx` is
> **static and does not fetch**: a data-bound node renders its authored fallback
> forever, and responsive (`sm:`/`md:`/`lg:`) overrides and the `video` atom are
> dropped. Every such divergence is printed during `build` and recorded as a
> comment header in the emitted component. Use the atomkit runtime renderer for
> pages that need live data, responsive overrides, video, or governance.

## Governance & safety

Pages render through atomkit's runtime, so every served page is governed twice:
`stripDocument` removes/masks `protected` / `roles` / `pii` / `consent` nodes at
egress, and the renderer re-gates per node. Governance runs **before** data
resolution, so a governed node is never fetched. Data binding delegates SSRF
control to atomkit-http's proxy (allow-list on the initial host + every redirect
hop) and additionally denies private/reserved IP hosts. Style values and URLs are
whitelisted; design tokens are sanitised before injection; the static file server
is path-traversal guarded. See [SECURITY.md](./SECURITY.md).

## Programmatic API

Everything the CLI does is exported: `create`, `dev`, `build`, `start`,
`collectRoutes`, `matchRoute`, `renderAqlSource`, `resolveData`, `pageShell`,
`loadConfig`. `renderAqlSource` and `build` are **async** (they resolve data
bindings) and both accept an injectable `fetchImpl` for tests.

## Notes

- Recursive file-watching for live reload uses `fs.watch({recursive:true})`
  (macOS/Windows); on platforms without it, it falls back to watching the `app/`
  root (nested-file edits may need a manual refresh).
- Pre-1.0: the API and scaffold may change between minor versions.

MIT © noidmejs
