# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — open a GitHub Security Advisory on
this repository (**Security → Report a vulnerability**). Do not file a public
issue for a suspected vulnerability. We aim to acknowledge within 3 business days.

## Supported versions

atomkit-app is **pre-1.0 (0.x)** — only the latest published minor receives fixes,
and minor versions may include breaking changes.

## Security model / trust boundary

atomkit-app is a **local developer tool + build step**. It reads your `.aql` pages
(trusted authoring input) and serves/emits HTML. Its defences:

- **Governance is enforced on every served/built page.** Rendering goes through the
  `@noidmejs/atomkit` runtime: `stripDocument` removes/masks `protected` / `roles` /
  `pii` / `consent` nodes at egress, and the renderer re-gates per node. The public
  viewer context defaults to least-privileged (`canViewProtected:false`,
  `canViewPii:false`, no analytics consent), so a page cannot leak governed content
  just by being served. Raise privileges deliberately in `atomkit.config.json`.
- **Style + URL whitelisting** comes from the runtime (`resolveStyle`, `safeHref`,
  `safeImageSrc`); the compiler path adds `safeDim` + governed-node omission.
- **Design tokens are sanitised** before injection into `:root` (charset-limited
  keys; `<`, `>`, `{`, `}` stripped from values; length-capped) so a token can't
  break out of the CSS rule or inject markup.
- **Static file serving is path-traversal guarded** — resolved paths must stay
  inside `public/` (dev) / the build dir (start); `..` segments are stripped and the
  resolved path is re-checked against the root.
- **The dev server binds `localhost`** and exposes only your `app/` routes, `public/`
  assets, and an SSE live-reload channel.

## Not in scope / limitations

- The dev/start servers are for **local development and simple static hosting** —
  they are not a hardened production web server (no TLS, rate limiting, or auth). For
  production, deploy the built static HTML behind your own CDN/host, or render the
  emitted `components/*.tsx` in your framework of choice.
- `.aql` is treated as **trusted authoring input**, not adversarial user input.
- Data-binding / API calls at runtime are a concern of
  [`@noidmejs/atomkit-http`](https://www.npmjs.com/package/@noidmejs/atomkit-http)
  and the atomkit runtime, not this tool.
- Not yet independently penetration-tested.
