import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, Render, defaultAtoms, stripDocument, type BuilderDocument } from '@noidmejs/atomkit';
import { renderContext, type AtomkitConfig } from './config.js';

export interface RenderedPage {
  html: string;
  title: string;
  description?: string;
}

/**
 * Render one `.aql` source to HTML via the atomkit runtime (SSR). Governance is
 * enforced twice: `stripDocument` removes/masks governed content at egress, and
 * `Render` re-gates per node (defence in depth). The output is safe static markup.
 */
export function renderAqlSource(src: string, cfg: AtomkitConfig): RenderedPage {
  const program = parse(src);
  const page = program.pages[0];
  const document: BuilderDocument = page?.document ?? { version: 1, root: [] };
  const ctx = renderContext(cfg);
  const safe = stripDocument(document, ctx);
  const html = renderToStaticMarkup(
    createElement(Render, { document: safe, registry: defaultAtoms, context: ctx }),
  );
  return { html, title: page?.title || cfg.title, description: page?.description ?? cfg.description };
}
