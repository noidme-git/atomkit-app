import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, Render, defaultAtoms, stripDocument, type BuilderDocument } from '@noidmejs/atomkit';
import { renderContext, type AtomkitConfig } from './config.js';
import { resolveData, type ResolveOptions } from './data.js';

export interface RenderedPage {
  html: string;
  title: string;
  description?: string;
  /** Notes about data bindings that were dropped (host not allowed, fetch failed, …). */
  notes: string[];
}

/**
 * Render one `.aql` source to HTML via the atomkit runtime (SSR). The pipeline is:
 *   parse → stripDocument (governance egress: remove/mask protected/roles/pii/consent)
 *   → resolveData (bake `api=` bindings to static values, SSRF-guarded, fail-closed)
 *   → renderToStaticMarkup (+ Render re-gates per node — defence in depth).
 * Governance runs BEFORE data resolution, so a masked/removed node is never fetched.
 */
export async function renderAqlSource(
  src: string,
  cfg: AtomkitConfig,
  opts: ResolveOptions = {},
): Promise<RenderedPage> {
  const program = parse(src);
  const page = program.pages[0];
  const document: BuilderDocument = page?.document ?? { version: 1, root: [] };
  const ctx = renderContext(cfg);
  const safe = stripDocument(document, ctx);
  const { doc: resolved, notes } = await resolveData(safe, cfg, opts);
  const html = renderToStaticMarkup(
    createElement(Render, { document: resolved, registry: defaultAtoms, context: ctx }),
  );
  return { html, title: page?.title || cfg.title, description: page?.description ?? cfg.description, notes };
}
