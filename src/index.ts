// @noidmejs/atomkit-app — the AQL app framework + generator.
//
// Scaffold, dev-serve, and build a UI app written entirely in AQL. The CLI
// (`atomkit-app`) is the primary interface; these exports let you embed the same
// pieces (routing, SSR, build) in your own tooling.
export { loadConfig, renderContext, type AtomkitConfig, type GovernanceContext } from './config.js';
export { collectRoutes, matchRoute, type Route } from './router.js';
export { renderAqlSource, type RenderedPage } from './render.js';
export { pageShell, type ShellOptions } from './html.js';
export { dev } from './dev.js';
export { build, type BuildResult } from './build.js';
export { start } from './start.js';
export { create } from './create.js';
export { pkgVersion } from './version.js';
