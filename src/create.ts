import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { pkgVersion } from './version.js';
import { log, ok } from './log.js';

/** Scaffold a new AQL app into `dirArg` (default `my-atomkit-app`). */
export function create(cwd: string, dirArg?: string): void {
  const target = resolve(cwd, dirArg ?? 'my-atomkit-app');
  const appName = basename(target).replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase() || 'atomkit-app';
  if (existsSync(target) && readdirSync(target).length) {
    throw new Error(`Target directory "${target}" exists and is not empty.`);
  }

  const files = templateFiles(appName, pkgVersion());
  for (const [rel, content] of Object.entries(files)) {
    const path = join(target, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  const cd = dirArg ?? 'my-atomkit-app';
  ok(`created "${appName}"`);
  for (const rel of Object.keys(files)) log(`   ${rel}`);
  log('\nNext steps:');
  log(`  cd ${cd}`);
  log('  npm install');
  log('  npm run dev        # → http://localhost:3300 (live reload)');
  log('\nThen:');
  log('  npm run build      # static HTML to deploy + React components you own');
  log('  npm run start      # serve the built site');
}

function templateFiles(appName: string, version: string): Record<string, string> {
  return {
    'package.json': JSON.stringify(
      {
        name: appName,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'atomkit-app dev',
          build: 'atomkit-app build',
          start: 'atomkit-app start',
        },
        devDependencies: { '@noidmejs/atomkit-app': `^${version}` },
      },
      null,
      2,
    ) + '\n',

    'atomkit.config.json': JSON.stringify(
      {
        title: 'My atomkit app',
        description: 'Built with atomkit + AQL',
        port: 3300,
        lang: 'en',
        tokens: {
          '--brand': '#005DAB',
          '--ink': '#0b1220',
          '--soft': '#f6f8fb',
          '--bg': '#ffffff',
        },
        data: {
          allowHosts: ['jsonplaceholder.typicode.com'],
          timeoutMs: 5000,
        },
      },
      null,
      2,
    ) + '\n',

    'app/index.aql': INDEX_AQL,
    'app/about.aql': ABOUT_AQL,
    'app/data.aql': DATA_AQL,
    'public/robots.txt': 'User-agent: *\nAllow: /\n',
    '.gitignore': 'node_modules\ndist\n*.log\n.DS_Store\n',
    'README.md': readmeFor(appName),
  };
}

const INDEX_AQL = `page "Home" desc="Built with atomkit + AQL — edit app/index.aql" {
  box as=section pad-y=96 bg="var(--soft,#f6f8fb)" {
    box dir=column gap=20 items=center align=center max-w=760 m-x=auto pad-x=24 {
      chip "ATOMKIT · AQL" bg="var(--brand,#005DAB)" color=#ffffff size=12px weight=800 case=uppercase ls=0.12em
      heading "Ship UI by writing AQL" level=1 size=clamp(2.2rem,6vw,3.6rem) color="var(--ink,#0b1220)" lh=1.05 align=center
      text "This whole page is one .aql file. Save app/index.aql and the browser hot-reloads. Run build to get static HTML plus standalone React you own." color="#4a5566" size=18px align=center max-w=58ch
      box dir=row gap=12 justify=center wrap=wrap {
        button "Read the guide" href=/about track=cta_guide bg="var(--brand,#005DAB)" color=#ffffff pad-x=22px pad-y=12px radius=999px weight=700
        button "View on GitHub" href=https://github.com/noidme-git/atomkit-app external border="1px solid #d4dae2" pad-x=22px pad-y=12px radius=999px weight=700 color="var(--ink,#0b1220)"
      }
    }
  }
  box as=section pad-y=64 max-w=980 m-x=auto pad-x=24 {
    grid cols=3 gap=20 {
      box dir=column gap=8 pad=20px radius=14px bg=#ffffff border="1px solid #edf0f4" {
        heading "File-based routing" level=3 size=18px color="var(--ink,#0b1220)"
        text "Drop .aql files in app/. index.aql is /, about.aql is /about." color="#4a5566" size=15px
      }
      box dir=column gap=8 pad=20px radius=14px bg=#ffffff border="1px solid #edf0f4" {
        heading "Governed by default" level=3 size=18px color="var(--ink,#0b1220)"
        text "Protected and PII nodes are stripped or masked at render — safe static output." color="#4a5566" size=15px
      }
      box dir=column gap=8 pad=20px radius=14px bg=#ffffff border="1px solid #edf0f4" {
        heading "Own your code" level=3 size=18px color="var(--ink,#0b1220)"
        text "build emits standalone React with no atomkit runtime dependency." color="#4a5566" size=15px
      }
    }
  }
}
`;

const ABOUT_AQL = `page "About" desc="How atomkit-app works" {
  box as=main pad-y=80 max-w=720 m-x=auto pad-x=24 {
    box dir=column gap=18 {
      heading "About this app" level=1 size=2.2rem color="var(--ink,#0b1220)"
      text "atomkit-app is a tiny framework for building UIs entirely in AQL — the Atomkit Query Language." size=18px color="#4a5566"
      heading "The pipeline" level=2 size=1.3rem color="var(--ink,#0b1220)"
      list {
        text "Author pages as .aql files in app/ (file-based routing)."
        text "atomkit-app dev serves them at http://localhost:3300 with live reload."
        text "atomkit-app build emits static HTML to deploy and standalone React you own."
        text "atomkit-app start serves the built site."
      }
      text "Every atom carries its own style, a11y, analytics and security as data — nothing is hard-coded." size=16px color="#4a5566"
      button "Back home" href=/ bg="var(--brand,#005DAB)" color=#ffffff pad-x=20px pad-y=10px radius=999px weight=700
    }
  }
}
`;

const DATA_AQL = `page "Data" desc="Server-resolved data binding via atomkit-http" {
  box as=main pad-y=80 max-w=720 m-x=auto pad-x=24 {
    box dir=column gap=16 {
      chip "SERVER-RESOLVED" bg="var(--brand,#005DAB)" color=#ffffff size=11px weight=800 case=uppercase ls=0.1em
      heading "Live data, baked at build time" level=1 size=2rem color="var(--ink,#0b1220)"
      text "The values below are fetched at render/build time from a public API through atomkit-http's SSRF-guarded connector (allowHosts in atomkit.config.json), then baked into static HTML. Offline or off-allowlist, the authored fallback shows instead." color="#4a5566" size=17px
      box dir=column gap=6 pad=20px radius=14px bg=#ffffff border="1px solid #edf0f4" {
        text "Loading name…" api="https://jsonplaceholder.typicode.com/users/1" path=name bind=text size=20px weight=700 color="var(--ink,#0b1220)"
        text "Loading company…" api="https://jsonplaceholder.typicode.com/users/1" path=company.name bind=text color="#4a5566"
        text "hidden@until-authorized" api="https://jsonplaceholder.typicode.com/users/1" path=email bind=text pii color="#8a94a3"
      }
      text "The last line is flagged pii: it renders masked (•••••) and is NEVER fetched for a public viewer — governance runs before data resolution." color="#8a94a3" size=13px
      button "Back home" href=/ bg="var(--brand,#005DAB)" color=#ffffff pad-x=20px pad-y=10px radius=999px weight=700
    }
  }
}
`;

function readmeFor(appName: string): string {
  return `# ${appName}

A UI app written in **AQL** (the Atomkit Query Language), powered by
[\`@noidmejs/atomkit-app\`](https://www.npmjs.com/package/@noidmejs/atomkit-app).

\`\`\`bash
npm install
npm run dev      # http://localhost:3300  (SSR + live reload)
npm run build    # static HTML (deploy) + components/*.tsx (own your code)
npm run start    # serve the build
\`\`\`

## Structure

\`\`\`
app/               file-based routing — each .aql is a route
  index.aql        →  /
  about.aql        →  /about
  data.aql         →  /data   (server-resolved data binding demo)
public/            static assets served verbatim
atomkit.config.json  title, port, design tokens, governance, data allowHosts
\`\`\`

Edit \`app/*.aql\` and the browser hot-reloads. Add a new file to add a route.

## Data binding

Bind a node to an API right in AQL:

\`\`\`
text "Loading…" api="https://api.example.com/thing" path=field bind=text
\`\`\`

The value is fetched **on the server at build/dev time** through
\`@noidmejs/atomkit-http\` and **baked into the static HTML** — the deployed page ships
no client JS. The URL's host must be in \`data.allowHosts\` in \`atomkit.config.json\`
(SSRF guard); otherwise, and when offline or on error, the authored fallback text
renders instead. A node flagged \`pii\` is masked and never fetched. Data is a
build-time snapshot — rebuild to refresh.
`;
}
