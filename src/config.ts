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
};

/** Load `atomkit.config.json` from `cwd`, merged over defaults. */
export function loadConfig(cwd: string): AtomkitConfig {
  const file = join(cwd, 'atomkit.config.json');
  let user: Partial<AtomkitConfig> = {};
  if (existsSync(file)) {
    try {
      user = JSON.parse(readFileSync(file, 'utf8')) as Partial<AtomkitConfig>;
    } catch (e) {
      throw new Error(`Invalid atomkit.config.json: ${(e as Error).message}`);
    }
  }
  return {
    ...DEFAULTS,
    ...user,
    tokens: { ...DEFAULTS.tokens, ...(user.tokens ?? {}) },
    context: { ...DEFAULTS.context, ...(user.context ?? {}) },
  };
}

/** Map the config's public governance facts to an atomkit `RenderContext`. */
export function renderContext(cfg: AtomkitConfig): RenderContext {
  return {
    canViewProtected: !!cfg.context.canViewProtected,
    canViewPii: !!cfg.context.canViewPii,
    roles: cfg.context.roles ?? [],
    consent: { analytics: !!cfg.context.analytics },
  };
}
