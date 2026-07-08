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
    blog/post.aql      →  /blog/post
  public/              static assets served verbatim
  atomkit.config.json  title, port, design tokens, governance context
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

## Governance & safety

Pages render through atomkit's runtime, so every served page is governed twice:
`stripDocument` removes/masks `protected` / `roles` / `pii` / `consent` nodes at
egress, and the renderer re-gates per node. Style values and URLs are whitelisted;
design tokens are sanitised before injection; the static file server is
path-traversal guarded. See [SECURITY.md](./SECURITY.md).

## Programmatic API

Everything the CLI does is exported: `create`, `dev`, `build`, `start`,
`collectRoutes`, `matchRoute`, `renderAqlSource`, `pageShell`, `loadConfig`.

## Notes

- Recursive file-watching for live reload uses `fs.watch({recursive:true})`
  (macOS/Windows); on platforms without it, it falls back to watching the `app/`
  root (nested-file edits may need a manual refresh).
- Pre-1.0: the API and scaffold may change between minor versions.

MIT © noidmejs
