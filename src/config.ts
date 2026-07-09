import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderContext } from '@noidmejs/atomkit';

/** The public-viewer governance facts the dev/build renderer assumes. Everything
 *  defaults to the *least* privileged (no protected, PII masked, no analytics
 *  consent) — a page can never leak governed content just by being served. */
export interface GovernanceContext {
  canViewProtected?: boolean;
  canViewPii?: boolean;
  roles?: string[];
  analytics?: boolean;
}

export interface AtomkitConfig {
  /** Default document title / fallback when a page declares none. */
  title: string;
  description?: string;
  /** Dev/start server port (default 3300). */
  port: number;
  lang: string;
  /** Directory of `.aql` pages (file-based routing root). */
  appDir: string;
  /** Static assets served verbatim. */
  publicDir: string;
  /** Build output directory. */
  outDir: string;
  /** CSS custom properties injected as `:root { … }` (design tokens). */
  tokens: Record<string, string>;
  /** How pages are rendered for the (public) viewer. */
  context: GovernanceContext;
  /** Server-side data binding — how `api=`-bound nodes are resolved at build/dev time. */
  data: DataConfig;
}

export interface DataConfig {
  /**
   * SSRF allow-list for data-bound URLs — exact host (`api.example.com`) or leading-dot
   * suffix (`.example.com`). A binding whose host is not listed is NOT fetched (its
   * authored fallback renders). Empty = no binding is ever fetched (fail-closed).
   */
  allowHosts: string[];
  /**
   * Curated server-only secret map referenced as `{{secret.NAME}}` in a bound URL/header.
   * Fill values from your environment in your own tooling — NEVER the whole `process.env`.
   */
  secrets?: Record<string, string>;
  /** Per-request timeout (ms) so a hung host degrades to the fallback fast. Default 5000. */
  timeoutMs?: number;
}

const DEFAULTS: AtomkitConfig = {
  title: 'atomkit app',
  port: 3300,
  lang: 'en',
  appDir: 'app',
  publicDir: 'public',
  outDir: 'dist',
  tokens: {},
  context: { canViewProtected: false, canViewPii: false, roles: [], analytics: false },
  data: { allowHosts: [], timeoutMs: 5000 },
};

// ── Validation ───────────────────────────────────────────────────────────────
// The config is the ONLY input that can widen governance, and its output is baked
// permanently into publicly served HTML. `"canViewPii": "false"` — a string, and
// the single most likely JSON mistake — is truthy, so a `!!` coercion silently
// granted PII visibility. Validate strictly and fail the build loudly instead.

const BOOL_KEYS = ['canViewProtected', 'canViewPii', 'analytics'] as const;

function fail(path: string, want: string, got: unknown): never {
  throw new Error(`Invalid atomkit.config.json: "${path}" must be ${want}, got ${JSON.stringify(got)} (${typeof got})`);
}

function checkStr(v: unknown, path: string): void { if (v !== undefined && typeof v !== 'string') fail(path, 'a string', v); }
function checkNum(v: unknown, path: string): void { if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) fail(path, 'a finite number', v); }
function checkBool(v: unknown, path: string): void { if (v !== undefined && typeof v !== 'boolean') fail(path, 'a boolean (true/false, not a string)', v); }
function checkStrArr(v: unknown, path: string): void {
  if (v === undefined) return;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(path, 'an array of strings', v);
}
function checkStrMap(v: unknown, path: string): void {
  if (v === undefined) return;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) fail(path, 'an object of string values', v);
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val !== 'string') fail(`${path}.${k}`, 'a string', val);
}
function checkNoUnknown(v: unknown, path: string, known: readonly string[]): void {
  if (v === undefined) return;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) fail(path, 'an object', v);
  for (const k of Object.keys(v as object)) {
    if (!known.includes(k)) throw new Error(`Invalid atomkit.config.json: unknown key "${path ? `${path}.` : ''}${k}"`);
  }
}

function validate(user: Record<string, unknown>): void {
  checkNoUnknown(user, '', ['title', 'description', 'port', 'lang', 'appDir', 'publicDir', 'outDir', 'tokens', 'context', 'data']);
  checkStr(user.title, 'title');
  checkStr(user.description, 'description');
  checkNum(user.port, 'port');
  checkStr(user.lang, 'lang');
  checkStr(user.appDir, 'appDir');
  checkStr(user.publicDir, 'publicDir');
  checkStr(user.outDir, 'outDir');
  checkStrMap(user.tokens, 'tokens');

  const ctx = user.context as Record<string, unknown> | undefined;
  checkNoUnknown(ctx, 'context', ['canViewProtected', 'canViewPii', 'roles', 'analytics']);
  if (ctx) {
    for (const k of BOOL_KEYS) checkBool(ctx[k], `context.${k}`);
    checkStrArr(ctx.roles, 'context.roles');
  }

  const data = user.data as Record<string, unknown> | undefined;
  checkNoUnknown(data, 'data', ['allowHosts', 'secrets', 'timeoutMs']);
  if (data) {
    checkStrArr(data.allowHosts, 'data.allowHosts');
    checkStrMap(data.secrets, 'data.secrets');
    checkNum(data.timeoutMs, 'data.timeoutMs');
  }
}

/** Load `atomkit.config.json` from `cwd`, merged over defaults. Throws on any
 *  type mismatch or unknown key rather than coercing — a governance flag must
 *  never be widened by a typo. */
export function loadConfig(cwd: string): AtomkitConfig {
  const file = join(cwd, 'atomkit.config.json');
  let user: Partial<AtomkitConfig> = {};
  if (existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`Invalid atomkit.config.json: ${(e as Error).message}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid atomkit.config.json: expected a JSON object');
    }
    validate(parsed as Record<string, unknown>);
    user = parsed as Partial<AtomkitConfig>;
  }
  return {
    ...DEFAULTS,
    ...user,
    tokens: { ...DEFAULTS.tokens, ...(user.tokens ?? {}) },
    context: { ...DEFAULTS.context, ...(user.context ?? {}) },
    data: { ...DEFAULTS.data, ...(user.data ?? {}) },
  };
}

/** Map the config's public governance facts to an atomkit `RenderContext`.
 *  Grants require an exact `true`: never widen privilege by coercion. */
export function renderContext(cfg: AtomkitConfig): RenderContext {
  return {
    canViewProtected: cfg.context.canViewProtected === true,
    canViewPii: cfg.context.canViewPii === true,
    roles: cfg.context.roles ?? [],
    consent: { analytics: cfg.context.analytics === true },
  };
}
