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

## Data binding (server-side resolution)

`api=`-bound nodes are fetched **on the server at build/dev time** and the value is
baked into static HTML. This is a server-side request surface, so:

- **SSRF** is delegated to `@noidmejs/atomkit-http`'s `createProxy().resolve()` — the
  host allow-list (`cfg.data.allowHosts`) is enforced on the **initial** request
  (secret-stripped, param-interpolated) **and** re-validated on every redirect hop;
  credentials are dropped on a cross-host redirect. On top of that, atomkit-app
  **denies private/reserved IP-literal hosts** (`localhost`, loopback, `169.254.x`
  incl. cloud metadata, `10/172.16-31/192.168`, CGNAT, ULA/link-local IPv6) before
  any fetch (dotted/decimal/hex/octal IPv4 and dotted/hex IPv4-mapped IPv6 are all
  recognised). **Known gaps:** hostnames are not DNS/IP-pinned, so an allow-listed
  host whose DNS resolves to a private IP is still reached (a DNS-rebinding TOCTOU
  window); and the private-IP deny runs on the *initial* URL only — a redirect to a
  private IP is stopped by the allow-list (fail-closed) rather than the IP deny, so
  do not allow-list a host you don't control. Only allow-list hosts you control.
- **Secrets** use a curated `cfg.data.secrets` map referenced as `{{secret.NAME}}` —
  never the whole `process.env`. Only the field selected by `path` is baked into
  HTML; the secret itself never is. Drop/failure notes log only the node id + reason,
  never the resolved URL or raw upstream error.
- **Governance first**: `stripDocument` runs before resolution, so `pii` / `protected`
  / consent-gated nodes are masked/removed and **never fetched**. The framework
  cannot inspect a *response* for PII — any api-bound node renders its resolved value
  into public HTML, so do not bind an unflagged node to a field that returns PII.
- **Fail-closed**: unlisted host / private IP / fetch error / empty / non-scalar all
  drop the binding to the authored fallback.
- **Supply chain**: the build bakes whatever the upstream returns into deployed HTML —
  a compromised/hijacked API compromises the static site. Data is a build-time
  snapshot; rebuild to refresh.
- **Eject divergence**: the ejected `components/*.tsx` keeps atomkit's client-side
  fetch (governed only by the browser CSP), unlike the SSRF-guarded, baked static
  HTML. Keep secret-bearing sources out of the ejected path.

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
