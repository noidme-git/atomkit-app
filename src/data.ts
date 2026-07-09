import { createProxy, interpolate, type DataSource, type RunResult } from '@noidmejs/atomkit-http';
import type { BuilderDocument, BuilderNode } from '@noidmejs/atomkit';
import type { AtomkitConfig } from './config.js';

export interface ResolveOptions {
  /** Override fetch (tests / custom runtimes). */
  fetchImpl?: typeof fetch;
}
export interface ResolveResult {
  doc: BuilderDocument;
  /** Human-readable notes about bindings that were dropped (host not allowed, fetch failed, …). */
  notes: string[];
}

/**
 * Resolve every `api=`-bound node in a document to a static value, server-side, so the
 * value is baked into the static HTML the framework emits (an api binding would otherwise
 * only render its client-side fallback under `renderToStaticMarkup`).
 *
 * Security is delegated to `@noidmejs/atomkit-http`'s `createProxy().resolve()`, which is
 * the ONLY path that guards BOTH the initial host (secret-stripped, param-interpolated) and
 * every redirect hop against the same allow-list. On top of that this pass:
 *   - denies private/reserved IP-literal hosts up front (cloud-metadata / loopback / LAN);
 *   - fails CLOSED — an unlisted host, a fetch error, an empty result, or a non-primitive
 *     value all DROP the binding so the authored fallback survives (never a blank or
 *     `[object Object]`);
 *   - only ever runs on the post-`stripDocument` tree, so `pii` / `protected` / consent-gated
 *     nodes have already been masked/removed and are provably never fetched.
 */
export async function resolveData(
  doc: BuilderDocument,
  cfg: AtomkitConfig,
  opts: ResolveOptions = {},
): Promise<ResolveResult> {
  const allowHosts = cfg.data?.allowHosts ?? [];
  const notes: string[] = [];
  const keyOf = (url: string, method: string, path: string): string => `${method} ${url} #${path}`;

  // 1. Collect the unique api sources across the tree; pre-flight each (scheme / private-IP).
  const jobs = new Map<string, DataSource>(); // key → source to fetch
  const drops = new Map<string, string>(); // key → reason (pre-flight rejected, never fetched)
  const scan = (node: BuilderNode): void => {
    const src = node.data?.source;
    if (src && src.kind === 'api') {
      const url = src.url ?? '';
      const method = src.method ?? 'GET';
      const path = src.path ?? '';
      const key = keyOf(url, method, path);
      if (!jobs.has(key) && !drops.has(key)) {
        const reason = preflight(url);
        if (reason) drops.set(key, reason);
        else
          // No `cache` on purpose. atomkit-http's cache is now per-instance and keyed on
          // the fully-resolved request (so it no longer bleeds across proxies or
          // credentials), but a build must still bake FRESH values: a cache hit would
          // silently freeze a stale value into the emitted HTML. Each resolveData call
          // fetches fresh; the `jobs` map already dedupes identical bindings per call.
          jobs.set(key, {
            id: key,
            url,
            method: method as DataSource['method'],
            transform: path || undefined,
            timeoutMs: cfg.data?.timeoutMs ?? 5000,
          });
      }
    }
    node.children?.forEach(scan);
  };
  doc.root.forEach(scan);

  // 2. Resolve unique jobs through the SSRF-guarded proxy (initial host + redirect hops).
  const results = new Map<string, RunResult>();
  if (jobs.size) {
    const proxy = createProxy({
      sources: Object.fromEntries(jobs),
      secrets: cfg.data?.secrets, // curated map only — never process.env
      allowHosts,
      fetchImpl: opts.fetchImpl,
    });
    await Promise.all(
      [...jobs.keys()].map(async (key) => {
        try {
          results.set(key, await proxy.resolve(key));
        } catch {
          results.set(key, { ok: false, status: 0, error: 'resolve threw' });
        }
      }),
    );
  }

  // 3. Rebuild the tree with NEW node objects (never mutate — stripDocument aliases leaf
  //    nodes by reference), replacing api bindings with resolved static values or dropping.
  const rebuild = (node: BuilderNode): BuilderNode => {
    let next = node;
    const src = node.data?.source;
    if (src && src.kind === 'api') {
      const key = keyOf(src.url ?? '', src.method ?? 'GET', src.path ?? '');
      const bindTo = node.data?.bindTo;
      const dropReason = drops.get(key);
      if (dropReason) {
        next = dropBinding(node);
        notes.push(`${describe(node)}: ${dropReason} → fallback`);
      } else {
        const r = results.get(key);
        if (r && r.ok && isBakeable(r.data)) {
          next = { ...node, data: { source: { kind: 'static', value: r.data }, ...(bindTo ? { bindTo } : {}) } };
        } else {
          next = dropBinding(node);
          notes.push(`${describe(node)}: ${explainMiss(r)} → fallback`);
        }
      }
    }
    if (node.children?.length) next = { ...next, children: node.children.map(rebuild) };
    return next;
  };

  return { doc: { ...doc, root: doc.root.map(rebuild) }, notes };
}

function explainMiss(r: RunResult | undefined): string {
  if (!r) return 'unresolved';
  if (!r.ok) return r.status === 403 ? 'host not allowed' : `fetch failed (status ${r.status})`;
  if (isEmpty(r.data)) return 'empty result';
  return 'non-primitive result (path must select a non-empty string/number/boolean)';
}

function isEmpty(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

// Only a non-empty scalar is baked. null/undefined, an empty/whitespace string, and any
// object/array DROP the binding so the authored fallback survives (never a blank or
// '[object Object]').
function isBakeable(v: unknown): v is string | number | boolean {
  if (typeof v === 'number' || typeof v === 'boolean') return true;
  return typeof v === 'string' && v.trim() !== '';
}

function dropBinding(node: BuilderNode): BuilderNode {
  const clone = { ...node };
  delete clone.data; // remove the binding entirely → the authored fallback renders
  return clone;
}

function describe(node: BuilderNode): string {
  return `data ${node.type}#${node.id}`;
}

/**
 * Pre-flight a bound URL: reject before any fetch if it is empty, non-http(s), or resolves
 * to a private/reserved IP literal. Returns a drop reason, or '' to proceed (the proxy then
 * enforces the host allow-list authoritatively). Secret refs are stripped and params emptied
 * to mirror the host the proxy will actually check.
 */
function preflight(url: string): string {
  if (!url) return 'no url';
  const stripped = url.replace(/\{\{\s*secret\.[\w.$-]+\s*\}\}/g, '');
  let host: string;
  try {
    const u = new URL(interpolate(stripped, { params: {}, secret: {} }));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return `scheme ${u.protocol} not allowed`;
    host = u.hostname.toLowerCase();
  } catch {
    return 'invalid url';
  }
  if (isPrivateHost(host)) return `private/reserved host (${host}) blocked`;
  return '';
}

/**
 * True for loopback / link-local / private / ULA / CGNAT IP literals and `localhost`.
 * Recognises IPv4 in dotted, decimal, hex and octal notations (WHATWG URL usually
 * canonicalises these, but this also holds for a raw string), a trailing dot, and both
 * dotted and hex IPv4-mapped IPv6 (`::ffff:127.0.0.1` / `::ffff:7f00:1`).
 *
 * This is defence-in-depth on the INITIAL bound URL. The authoritative SSRF gate is the
 * fail-closed host allow-list in atomkit-http's proxy (initial host + every redirect hop);
 * a redirect to a private IP is blocked unless the operator allow-listed that IP.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); // brackets + trailing dot
  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  if (h.includes(':')) {
    // IPv6 (or IPv4-mapped IPv6).
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('fe80:')) return true; // link-local
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // ULA fc00::/7
    if (h.startsWith('::ffff:')) {
      const tail = h.slice(7);
      const v4 = parseIPv4(tail) ?? hexPairToV4(tail); // dotted OR hex (7f00:1) form
      if (v4) return isPrivateV4(v4);
    }
    return false; // any other IPv6 → allow-list is authoritative
  }

  const v4 = parseIPv4(h);
  return v4 ? isPrivateV4(v4) : false; // otherwise a hostname
}

/** Parse IPv4 in inet_aton notation (dotted/decimal/hex/octal, 1–4 parts) → octets. */
function parseIPv4(s: string): [number, number, number, number] | null {
  const parts = s.split('.');
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    let n: number;
    if (/^0x[0-9a-f]+$/.test(p)) n = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^(0|[1-9][0-9]*)$/.test(p)) n = parseInt(p, 10);
    else return null;
    nums.push(n);
  }
  const last = nums[nums.length - 1]!;
  const lead = nums.slice(0, -1);
  if (lead.some((x) => x > 255)) return null;
  const maxLast = [0xffffffff, 0xffffff, 0xffff, 0xff][lead.length];
  if (maxLast === undefined || last > maxLast) return null;
  let value = last;
  for (let i = 0; i < lead.length; i++) value += lead[i]! * 2 ** (8 * (3 - i));
  if (value < 0 || value > 0xffffffff) return null;
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

/** `7f00:1` (two hex groups after ::ffff:) → 127.0.0.1 octets. */
function hexPairToV4(tail: string): [number, number, number, number] | null {
  const m = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!m) return null;
  const hi = parseInt(m[1]!, 16);
  const lo = parseInt(m[2]!, 16);
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
}

function isPrivateV4([a, b]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}
