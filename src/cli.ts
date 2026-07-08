#!/usr/bin/env node
import { create } from './create.js';
import { dev } from './dev.js';
import { build } from './build.js';
import { start } from './start.js';
import { pkgVersion } from './version.js';
import { log, warn } from './log.js';

const USAGE = `atomkit-app ${pkgVersion()} — the AQL app framework

Usage:
  atomkit-app create [dir]      Scaffold a new AQL app
  atomkit-app dev [--port N]    Dev server — SSR + live reload (default :3300)
  atomkit-app build [--out D]   Compile to static HTML + standalone React (own your code)
  atomkit-app start [--port N]  Serve the built site

Docs: https://github.com/noidme-git/atomkit-app`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  const cwd = process.cwd();
  const portFlag = flag(rest, '--port');
  const port = portFlag !== undefined ? Number(portFlag) : undefined;
  if (port !== undefined && !Number.isFinite(port)) {
    warn('--port must be a number');
    process.exit(1);
  }

  try {
    switch (cmd) {
      case 'create':
      case 'new':
      case 'init':
        create(cwd, rest.find((a) => !a.startsWith('-')));
        break;
      case 'dev':
        dev(cwd, port);
        break;
      case 'build':
        build(cwd, flag(rest, '--out'));
        break;
      case 'start':
        start(cwd, port);
        break;
      case undefined:
      case '-h':
      case '--help':
        log(USAGE);
        break;
      case '-v':
      case '--version':
        log(pkgVersion());
        break;
      default:
        warn(`unknown command: ${cmd}`);
        log(`\n${USAGE}`);
        process.exit(1);
    }
  } catch (e) {
    warn((e as Error).message);
    process.exit(1);
  }
}

main();
