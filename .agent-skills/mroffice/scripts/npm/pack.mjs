#!/usr/bin/env node
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The editors as npm packages, built from this tree:
//
//   npm run pack:npm [-- --version 0.1.0] [--out dist/npm] [--no-pack]
//
// One Vite build of every package's entry (React and React DOM stay outside,
// everything else is bundled, the Tailwind stylesheet compiled), whose chunks
// are then shared out: a chunk only one editor reaches goes into that
// editor's package, anything else into mroffice-core. Each package is
// compiled ES modules, its types, and style.css. The heavy files (fonts, the
// PDF worker, dictionaries, WebAssembly, the interface text in languages
// other than English) go into mroffice-assets, which is served from a CDN
// (or copied to the site) and never installed as a dependency.
//
// It writes <out>/<package>/ (each ready for `npm publish`) and, unless
// --no-pack, <out>/tarballs/<package>-<version>.tgz. It stops on anything it
// cannot account for: a source patch that no longer applies, a public path
// left in the code, process.env, a chunk of the shared layer importing an
// editor's, an export without a type, a missing asset.
//
// Needs `npm install` and `npm run fonts` first (the up-front fonts go into
// mroffice-assets).

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readmeFor, assetsReadme } from "./readme/readme.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const require = createRequire(join(ROOT, "package.json"));
const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const flag = (name) => argv.includes(name);

const CONFIG = JSON.parse(readFileSync(join(HERE, "packages.json"), "utf8"));
const VERSION = option("--version", CONFIG.version);
const OUT = resolve(ROOT, option("--out", "dist/npm"));
const WORK = join(OUT, ".build");
const BUILD = join(WORK, "out");
const ENTRIES = join(WORK, "entries");
const PUBLIC = join(ROOT, "apps/playground/public");
const PACKAGES = Object.keys(CONFIG.packages);
const EDITORS = PACKAGES.filter((pkg) => pkg !== "core");
const npmName = (pkg) => CONFIG.packages[pkg].name;
const CDN = `https://cdn.jsdelivr.net/npm/${CONFIG.assets.name}@${VERSION}/`;
const RUNTIME = join(HERE, "runtime/runtime.ts");
const problems = [];
const notes = new Set();

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(VERSION)) throw new Error(`--version ${VERSION} is not a version`);
if (!existsSync(join(ROOT, "node_modules/vite"))) throw new Error("run npm install first");
if (!existsSync(join(PUBLIC, "fonts/office/arimo"))) throw new Error("apps/playground/public/fonts/office is missing: run npm run fonts first");

// ------------------------------------------------------------------ patches
//
// The editors name their files by path on their own site ("/fonts/office/",
// "/pdf.worker.min.mjs"). In the packages each such name is the file's URL
// under the assets base (runtime.ts mrofficeAsset), and a worker of
// mroffice-assets is started through mrofficeWorker (a CDN is another
// origin). Each entry: [file under packages/, the text, how many times].

const ASSET_LITERALS = [
  ["core/src/web/lib/pdf/pdfjs-asset-urls.ts", '"/pdf.worker.min.mjs"', 1],
  ["core/src/web/lib/pdf/pdfjs-asset-urls.ts", '"/pdfjs-cmaps/"', 1],
  ["core/src/web/lib/pdf/pdfjs-asset-urls.ts", '"/pdfjs-standard-fonts/"', 1],
  ["core/src/web/lib/pdf/pdfjs-asset-urls.ts", '"/pdfjs-wasm/"', 1],
  ["core/src/web/lib/office-fonts/substitutes.ts", '"/fonts/office/"', 1],
  ["core/src/web/lib/office-fonts/substitutes.ts", '"/fonts/cjk-latin/"', 1],
  // not part of the open build's public files (nor the playground's): named, so it is the assets' when it is
  ["core/src/web/lib/office-fonts/hangul-em.ts", '"/fonts/hangul-em/"', 1, undefined, { absent: true }],
  // the spreadsheet's regional-letters face (Selawik subset): not among the open build's public files either
  ["core/src/web/lib/spreadsheet/office-regional-letters.ts", '"/fonts/regional-letters/regional-letters-600.woff2"', 1, undefined, { absent: true }],
  ["core/src/web/lib/office-fonts/embeddable-faces.ts", '"/fonts/office/"', 1],
  ["core/src/web/lib/text-engine/face-order.ts", '"/fonts/office/carlito/400-latin.woff2"', 1],
  ["core/src/web/lib/text-engine/face-order.ts", '"/fonts/office/arimo/400-latin.woff2"', 1],
  ["core/src/web/lib/proofing/spelling-dictionaries.ts", '"/proofing/dictionaries"', 1],
  ["core/src/web/lib/proofing/spelling-worker-client.ts", '"/proofing/spelling-worker.js"', 1],
  ["core/src/web/lib/code-runner/python-runner.ts", '"/python-worker.js"', 1],
  ["core/src/web/lib/code-runner/python-runner.ts", '"/python-sandbox.html"', 1],
  ["core/src/web/lib/code-runner/sandbox.ts", '"/code-sandbox.html?profile=vibe-shared-v1"', 1],
  ["core/src/web/lib/code-runner/sandbox.ts", '"/code-sandbox.html"', 1],
  ["code/src/web/lib/code-runner/lua-runner.ts", '"/lua-execution-worker.js"', 1],
  ["code/src/web/lib/code-runner/lua-language-provider.ts", '"/lua-execution-worker.js"', 1],
  ["code/src/web/lib/code-runner/sql-runner.ts", '"/sql-execution-worker.js"', 1],
  ["code/src/web/lib/code-runner/go-wasm-toolchain.ts", '"/go-toolchain-worker.js"', 1],
  ["code/src/web/lib/code-runner/shell-language-worker.ts", '"/shell-execution.wasm"', 1],
  ["code/src/web/lib/code-runner/shell-execution-worker.ts", '"/shell-execution.wasm"', 1],
  ["pdf/src/web/lib/pdf/unicode-font-asset.ts", '"/fonts/NotoSansSC-Regular.ttf"', 1],
  ["pdf/src/web/lib/pdf/unicode-font-asset.ts", '"/fonts/NotoSansArabic-Regular.ttf"', 1],
  ["pdf/src/web/lib/pdf/unicode-font-asset.ts", '"/fonts/NotoSansHebrew-Regular.ttf"', 1],
  ["pdf/src/web/lib/pdf/unicode-font-asset.ts", '"/fonts/NotoSansThai-Regular.ttf"', 1],
  ["pdf/src/web/lib/pdf/unicode-font-asset.ts", '"/fonts/NotoSansDevanagari-Regular.ttf"', 1],
  ["pdf/src/web/lib/pdf/unicode-font-asset.ts", '"/fonts/NotoSansBengali-Regular.ttf"', 1],
  // PathKit (pathkit-wasm), which the text-outline worker loads: a file of the assets (PATHKIT)
  ["core/src/web/lib/office-text-outline/office-text-outline.worker.ts", 'new URL("pathkit-wasm/bin/pathkit.js", import.meta.url).href', 1, '__mrofficeAsset("/pathkit/pathkit.js")'],
  ["core/src/web/lib/office-text-outline/office-text-outline.worker.ts", 'new URL("pathkit-wasm/bin/pathkit.wasm", import.meta.url)', 1, '__mrofficeAsset("/pathkit/pathkit.wasm")'],
  ["slides/src/web/lib/presentation-smartart-font-policy.ts", 'fetch("/fonts/NotoSansSC-Regular.ttf"', 1, 'fetch(__mrofficeAsset("/fonts/NotoSansSC-Regular.ttf")'],
  ["slides/src/web/lib/presentation-smartart-font-policy.ts", '`url("/fonts/NotoSansSC-Regular.ttf") format("truetype")`', 1, '`url("${__mrofficeAsset("/fonts/NotoSansSC-Regular.ttf")}") format("truetype")`'],
];
const PATHKIT = ["pathkit.js", "pathkit.wasm"];
// workers that are files of mroffice-assets
const ASSET_WORKERS = [
  ["core/src/web/lib/proofing/spelling-worker-client.ts", 1],
  ["core/src/web/lib/code-runner/python-runner.ts", 1],
  ["code/src/web/lib/code-runner/lua-runner.ts", 1],
  ["code/src/web/lib/code-runner/lua-language-provider.ts", 1],
  ["code/src/web/lib/code-runner/sql-runner.ts", 1],
  ["code/src/web/lib/code-runner/go-wasm-toolchain.ts", 1],
];
// Ruby's runtime is a 31 MB WebAssembly file the open-source build does not
// wire up (packages/code README): not in the packages either.
const LEFT_OUT_WORKERS = { "code/src/web/lib/code-runner/ruby-execution-worker.ts": "Ruby's runtime is not part of the npm packages." };

const REACT = /^react(-dom)?(\/|$)/;
const applied = new Map();
const count = (key, n) => applied.set(key, (applied.get(key) ?? 0) + n);
const packagesDir = join(ROOT, "packages") + "/";
const relOf = (id) => (id.startsWith(packagesDir) ? id.slice(packagesDir.length).replace(/[?#].*$/, "") : null);

function patchSource(id, code) {
  const rel = relOf(id);
  if (!rel || !/\.[cm]?[jt]sx?$/.test(rel)) return null;
  let text = code;
  let uses = false;
  for (const [file, find, expected, replace] of ASSET_LITERALS) {
    if (file !== rel) continue;
    // a module is transformed once for each bundle holding it (the page's, a worker's)
    const n = text.split(find).length - 1;
    count(`${file} ${find}`, 1);
    if (n !== expected) {
      problems.push(`packages/${file}: ${find} found ${n} times, expected ${expected} (the source changed: update scripts/npm/pack.mjs)`);
      continue;
    }
    // marked, so the check over the built code tells it from a path left as it was
    text = text.split(find).join((replace ?? `__mrofficeAsset(${find})`).replace(/__mrofficeAsset\((["`])\//g, "__mrofficeAsset($1mroffice-asset:/"));
    uses = true;
  }
  let workers = false;
  for (const [file, expected] of ASSET_WORKERS) {
    if (file !== rel) continue;
    const n = (text.match(/(?<!`)\bnew Worker\(/g) ?? []).length;
    count(`${file} new Worker(`, 1);
    if (n !== expected) problems.push(`packages/${file}: new Worker( found ${n} times, expected ${expected}`);
    text = text.replace(/(?<!`)\bnew Worker\(/g, "__mrofficeWorker(");
    workers = true;
  }
  // a module worker of the editors' own: bundled into the module that starts it
  let inline = 0;
  const imports = [];
  text = text.replace(/\bnew Worker\(\s*new URL\(\s*(["'`])(\.{1,2}\/[^"'`]+)\1\s*,\s*import\.meta\.url\s*\)\s*([,)])/g, (whole, quote, spec, after) => {
    const name = `__mrofficeInlineWorker${inline++}`;
    imports.push(`import ${name} from ${JSON.stringify(`${spec}?worker&inline`)};`);
    return after === "," ? `new ${name}(` : `new ${name}()`;
  });
  if (/\bnew URL\(\s*["'`][^"'`]+["'`]\s*,\s*import\.meta\.url\s*\)/.test(text)) {
    problems.push(`${rel}: a file named relative to the module (new URL(..., import.meta.url)) that the packages do not carry`);
  }
  if (!uses && !workers && !inline) return null;
  const helpers = [uses && "mrofficeAsset as __mrofficeAsset", workers && "mrofficeWorker as __mrofficeWorker"].filter(Boolean);
  const head = [...imports, helpers.length ? `import { ${helpers.join(", ")} } from ${JSON.stringify(RUNTIME)};` : ""].join("\n");
  // after a "use client" directive, if any
  const directive = text.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*(["']use (?:client|server)["'];?)/);
  if (directive) {
    const at = directive.index + directive[0].length;
    return `${text.slice(0, at)}\n${head}\n${text.slice(at)}`;
  }
  return `${head}\n${text}`;
}

/** The interface text: English in the package, the other languages fetched
 * from the assets (messages/<locale>/<namespace>.json) when chosen. */
function messagesModule(source) {
  const locales = [...source.matchAll(/^\s*"([^"]+)": async \(\) => \(\{(.*)\}\),$/gm)].map((match) => ({
    locale: match[1],
    namespaces: [...match[2].matchAll(/"([^"]+)": \(await import/g)].map((ns) => ns[1]),
  }));
  if (!locales.length || !locales.some((entry) => entry.locale === "en")) problems.push("packages/core/src/messages/index.ts: its loaders are not the shape the packages read");
  const namespaces = source.match(/export const MESSAGE_NAMESPACES = (\[[^\]]*\]);/)?.[1] ?? "[]";
  const lines = [
    `import { mrofficeAsset } from ${JSON.stringify(RUNTIME)};`,
    "const remote = (locale, namespaces) => async () => {",
    "  const out = {};",
    "  await Promise.all(namespaces.map(async (ns) => {",
    "    try {",
    "      const response = await fetch(mrofficeAsset(`mroffice-asset:/messages/${locale}/${ns}.json`));",
    "      if (response.ok) out[ns] = await response.json();",
    "    } catch {",
    "      /* the English text stays */",
    "    }",
    "  }));",
    "  return out;",
    "};",
    "export const MESSAGE_LOADERS = {",
  ];
  for (const { locale, namespaces: list } of locales) {
    if (locale === "en") lines.push(`  "en": async () => ({ ${list.map((ns) => `${JSON.stringify(ns)}: (await import("./en/${ns}.json")).default`).join(", ")} }),`);
    else lines.push(`  ${JSON.stringify(locale)}: remote(${JSON.stringify(locale)}, ${JSON.stringify(list)}),`);
  }
  lines.push("};", `export const MESSAGE_NAMESPACES = ${namespaces};`, "");
  return { code: lines.join("\n"), locales };
}

// ------------------------------------------------------------------ build

const graph = { chunks: [], assets: [], css: null, workers: [] };
let messageLocales = [];

function npmPlugin({ worker = false } = {}) {
  return {
    name: "mroffice-npm",
    enforce: "pre",
    // React and React DOM are the page's (peer dependencies): imported, never
    // bundled. A CommonJS module bundled here that require()s one gets it
    // through a module that imports it (an ES module cannot require). A
    // worker is one script of its own: what it takes of React is in it.
    resolveId(id, _importer, options) {
      if (worker || !REACT.test(id)) return null;
      if (options?.kind === "require-call") return `\0mroffice-require:${id}`;
      return { id, external: true };
    },
    load(id) {
      if (id.startsWith("\0mroffice-require:")) {
        const spec = JSON.stringify(id.slice("\0mroffice-require:".length));
        return `import * as external from ${spec};\nexport default external;\nexport * from ${spec};\n`;
      }
      // a module as itself, not a form of it (?worker&inline)
      if (id.includes("?")) return null;
      const rel = relOf(id);
      if (rel === "core/src/messages/index.ts") {
        const { code, locales } = messagesModule(readFileSync(id, "utf8"));
        messageLocales = locales;
        return code;
      }
      if (rel && LEFT_OUT_WORKERS[rel]) {
        count(`left out ${rel}`, 1);
        return `self.onmessage = (event) => self.postMessage({ type: "fatal", id: event.data?.id, error: ${JSON.stringify(LEFT_OUT_WORKERS[rel])} });\n`;
      }
      return null;
    },
    transform: {
      filter: { id: /\/packages\/[a-z]+\/src\// },
      handler(code, id) {
        if (id.includes("?")) return null;
        const patched = patchSource(id, code);
        return patched === null ? null : { code: patched, map: null };
      },
    },
  };
}

function graphPlugin(target) {
  const collect = (bundle) => {
    for (const item of Object.values(bundle)) {
      if (item.type === "chunk") target.push({ fileName: item.fileName, name: item.name, isEntry: item.isEntry, imports: item.imports, dynamicImports: item.dynamicImports, code: item.code });
      else if (target === graph.chunks) graph.assets.push({ fileName: item.fileName });
    }
  };
  // the page's bundle once every plugin has added its files (the stylesheet
  // among them); a worker's bundle is generated, never written
  return target === graph.chunks
    ? { name: "mroffice-npm-graph", writeBundle: (_options, bundle) => collect(bundle) }
    : { name: "mroffice-npm-graph", enforce: "post", generateBundle: (_options, bundle) => collect(bundle) };
}

async function runBuild() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(ENTRIES, { recursive: true });
  const input = {};
  for (const pkg of PACKAGES) {
    const file = join(ENTRIES, `${pkg}.ts`);
    const lines = [];
    if (pkg === "core") {
      // the editors' global stylesheets (the playground's main.tsx imports the same)
      for (const css of ["globals.css", "surface-motion.css", "press-feedback.css", "native-page-window.css"]) lines.push(`import "@mrnote/core/web/styles/${css}";`);
      lines.push(`export * from "@mrnote/core";`);
      lines.push(`export { EditorHostProvider } from "./provider";`);
      lines.push(`export { configureEditors, assetsBaseUrl, mrofficeAsset, MROFFICE_VERSION, DEFAULT_ASSETS_BASE_URL } from ${JSON.stringify(RUNTIME)};`);
    } else {
      lines.push(`export * from "@mrnote/${pkg}";`, `export { default } from "@mrnote/${pkg}";`);
    }
    writeFileSync(file, `${lines.join("\n")}\n`);
    input[pkg] = file;
  }
  writeFileSync(
    join(ENTRIES, "provider.ts"),
    [
      `import { createElement, type ComponentProps } from "react";`,
      `import { EditorHostProvider as Provider } from "@mrnote/core";`,
      `import { linkEditorFonts } from ${JSON.stringify(RUNTIME)};`,
      `export function EditorHostProvider(props: ComponentProps<typeof Provider>) {`,
      `  linkEditorFonts();`,
      `  return createElement(Provider, props);`,
      `}`,
      "",
    ].join("\n"),
  );

  const { build, createLogger } = await import(require.resolve("vite"));
  // the stylesheets name the fonts by their path on the site: left for the runtime (stylesheets() below)
  const logger = createLogger("warn");
  const warn = logger.warn.bind(logger);
  logger.warn = (message, options) => (/^\/fonts\/\S+ referenced in .* didn't resolve at build time/.test(message) || /PLUGIN_TIMINGS/.test(message) ? undefined : warn(message, options));
  const react = (await import(require.resolve("@vitejs/plugin-react"))).default;
  const tailwindcss = require("tailwindcss");
  const autoprefixer = require("autoprefixer");
  const define = {
    "process.env.NODE_ENV": JSON.stringify("production"),
    // the settings MR Note's pages read from process.env: none, unless
    // configureEditors() sets one (runtime.ts)
    "process.env": "(globalThis.MROFFICE_ENV || {})",
    __MROFFICE_NPM_VERSION__: JSON.stringify(VERSION),
    // the UMD wrappers of bundled libraries take their CommonJS branch (bundled
    // here), never the AMD one, whose define(["dep"]) a page's bundler would
    // try to resolve
    define: "undefined",
  };
  await build({
    configFile: false,
    root: ENTRIES,
    base: "./",
    publicDir: false,
    logLevel: "warn",
    customLogger: logger,
    mode: "production",
    plugins: [npmPlugin(), react(), graphPlugin(graph.chunks)],
    define,
    css: { postcss: { plugins: [tailwindcss(join(ROOT, "apps/playground/tailwind.config.cjs")), autoprefixer()] } },
    resolve: {
      dedupe: ["react", "react-dom", "yjs", "@codemirror/state", "@codemirror/view", "@codemirror/language", "@tiptap/pm", "@tiptap/core", "pdfjs-dist"],
    },
    worker: { format: "iife", plugins: () => [npmPlugin({ worker: true }), graphPlugin(graph.workers)] },
    build: {
      outDir: BUILD,
      emptyOutDir: true,
      target: "es2022",
      sourcemap: false,
      cssCodeSplit: false,
      modulePreload: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1e9,
      // pictures in the stylesheets inline; fonts and WebAssembly are files
      assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf|eot|wasm)$/i.test(file) ? false : undefined),
      rollupOptions: {
        input,
        preserveEntrySignatures: "strict",
        checks: { pluginTimings: false },
        output: {
          format: "es",
          entryFileNames: "[name].js",
          // (a locale chunk named sk-SK-<hash> reads like a credential to secret scanners)
          chunkFileNames: (chunk) => `chunks/${chunk.name.replace(/^sk-/i, "sk_")}-[hash].js`,
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  });
  writeFileSync(join(WORK, "graph.json"), JSON.stringify({ chunks: graph.chunks.map(({ code, ...rest }) => rest), assets: graph.assets, workers: graph.workers.map(({ code, ...rest }) => rest), messageLocales }, null, 1));
}

// ------------------------------------------------------------------ checks over the code

const PUBLIC_PATH_LITERAL = /(["'`])\/(fonts\/|pdfjs-[a-z]|pdf\.worker|proofing\/|[A-Za-z0-9_-]+-worker\.js|[A-Za-z0-9_-]+\.wasm|[A-Za-z0-9_-]+-sandbox\.html|code-sandbox\.html|messages\/)/g;
function checkCode(label, code) {
  for (const match of code.matchAll(PUBLIC_PATH_LITERAL)) {
    const before = code.slice(Math.max(0, match.index - 24), match.index);
    // a test of a URL (`url.includes("/fonts/office/")`), not a fetch
    if (/\.(includes|startsWith|endsWith|indexOf)\($/.test(before)) continue;
    problems.push(`${label}: a path on the editors' own site left in the code: ${code.slice(match.index, match.index + 60)}`);
  }
  const env = code.match(/\bprocess\.env\b/);
  if (env) problems.push(`${label}: process.env left in the code: ${code.slice(Math.max(0, env.index - 40), env.index + 40)}`);
  const relativeUrl = code.match(/new URL\(\s*["'`][^"'`]*["'`]\s*,\s*(?:["'`]["'`]\s*\+\s*)?import\.meta\.url\s*\)/);
  if (relativeUrl) problems.push(`${label}: a file named relative to the module: ${relativeUrl[0].slice(0, 120)}`);
}

// ------------------------------------------------------------------ the packages

function chunkOwners() {
  const byFile = new Map(graph.chunks.map((chunk) => [chunk.fileName, chunk]));
  const reach = new Map(graph.chunks.map((chunk) => [chunk.fileName, new Set()]));
  for (const pkg of PACKAGES) {
    const stack = [`${pkg}.js`];
    while (stack.length) {
      const file = stack.pop();
      const chunk = byFile.get(file);
      if (!chunk || reach.get(file).has(pkg)) continue;
      reach.get(file).add(pkg);
      stack.push(...chunk.imports, ...chunk.dynamicImports);
    }
  }
  const owner = new Map();
  for (const chunk of graph.chunks) {
    const reached = [...reach.get(chunk.fileName)];
    if (chunk.isEntry) owner.set(chunk.fileName, chunk.name);
    else if (!reached.length) problems.push(`${chunk.fileName}: no entry reaches it`);
    else owner.set(chunk.fileName, reached.length === 1 ? reached[0] : "core");
  }
  for (const chunk of graph.chunks) {
    for (const target of [...chunk.imports, ...chunk.dynamicImports].filter((file) => byFile.has(file))) {
      const from = owner.get(chunk.fileName);
      const to = owner.get(target);
      if (to !== "core" && to !== from) problems.push(`${chunk.fileName} (${from}) imports ${target} (${to}): only mroffice-core is shared`);
    }
  }
  return owner;
}

/** The chunk's code with its imports of another package's chunks named by
 * that package (mroffice-core/dist/chunks/...). */
function relinked(chunk, owner) {
  const from = owner.get(chunk.fileName);
  const dir = posix.dirname(chunk.fileName);
  // An import() of a URL computed at run time (PDF.js's worker) is the
  // browser's to load: the page's bundler is told to leave it (the comments
  // PDF.js carries for that are gone with the minifying).
  const code = chunk.code.replace(/(?<![.\w$])import\((?=\s*[A-Za-z_])/g, "import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ ");
  return code.replace(/(["'`])(\.{1,2}\/[^"'`\s]+?\.js)\1/g, (whole, quote, spec) => {
    const target = posix.normalize(posix.join(dir, spec));
    if (!owner.has(target)) return whole;
    const to = owner.get(target);
    if (to === from) return whole;
    return `${quote}${npmName(to)}/dist/${target}${quote}`;
  });
}

function exportNames(code) {
  const names = new Set();
  for (const match of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const match of code.matchAll(/\bexport\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  if (/\bexport\s+default\b/.test(code)) names.add("default");
  return names;
}

function declaredNames(dts) {
  const names = new Set();
  for (const match of dts.matchAll(/^export\s+(?:declare\s+)?(?:const|function|class|let)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  if (/^export default\b/m.test(dts)) names.add("default");
  return names;
}

const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
/** style.css (the fonts from the CDN), style.self-hosted.css (no fonts) and
 * mroffice-assets/fonts.css (the fonts, named relative to it). */
function stylesheets(css, cssFile) {
  const faces = css.match(FONT_FACE) ?? [];
  const rest = css.replace(FONT_FACE, "");
  const urls = (text, map) => text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole, quote, url) => {
    if (/^(data:|https?:|#|%23)/.test(url)) return whole;
    const mapped = map(url);
    if (mapped === null) {
      problems.push(`style.css: url(${url}) names a file the packages do not carry`);
      return whole;
    }
    return `url(${quote}${mapped}${quote})`;
  });
  // a font file is a public file of the editors' site (/fonts/...) or one the build emitted (assets/...)
  const fontPath = (url) => {
    const clean = url.replace(/[?#].*$/, "");
    if (clean.startsWith("/")) {
      // as in the playground, a face whose file the open build does not have stays named (and is not drawn)
      if (!existsSync(join(PUBLIC, clean))) notes.add(`a font face names ${clean}, which neither the playground nor the assets have`);
      return clean.slice(1);
    }
    const path = posix.normalize(posix.join(posix.dirname(cssFile), clean));
    return path.startsWith("assets/") && existsSync(join(BUILD, path)) ? path : null;
  };
  // Outside the font faces: pictures are inlined; what is left is a path on
  // MR Note's site that the open build does not have either (the notebook
  // covers' textures), left as it is.
  for (const match of rest.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    if (/^(data:|https?:|#|%23)/.test(match[1])) continue;
    if (match[1].startsWith("/") && !existsSync(join(PUBLIC, match[1]))) notes.add(`style.css names files under ${match[1].split("/").slice(0, 2).join("/")}/ that neither the playground nor the packages have (left as they are)`);
    else problems.push(`style.css: url(${match[1]}) outside a font face`);
  }
  // (named under the assets base, so a bundler reading the stylesheet does not look for them)
  const restNamed = urls(rest, (url) => (url.startsWith("/") ? CDN + url.slice(1) : null));
  const marker = ":root{--mroffice-fonts:declared}";
  return {
    cdn: `${restNamed}\n${marker}\n${urls(faces.join("\n"), (url) => (fontPath(url) === null ? null : CDN + fontPath(url)))}\n`,
    selfHosted: restNamed,
    fonts: `/* The fonts of the MR Office editors (${npmName("core")} style.self-hosted.css leaves them out). */\n${marker}\n${urls(faces.join("\n"), fontPath)}\n`,
    faceFiles: [...new Set(faces.flatMap((face) => [...face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((match) => fontPath(match[1])).filter((path) => path && existsSync(join(path.startsWith("assets/") ? BUILD : PUBLIC, path)))))],
  };
}

function assemble() {
  const owner = chunkOwners();
  const cssAsset = graph.assets.find((asset) => asset.fileName.endsWith(".css"));
  if (!cssAsset) problems.push("the build wrote no stylesheet");
  const css = stylesheets(readFileSync(join(BUILD, cssAsset.fileName), "utf8"), cssAsset.fileName);
  for (const worker of graph.workers) {
    checkCode(`worker ${worker.fileName}`, worker.code);
    // a worker is one script: nothing outside it (React is the page's)
    if (worker.imports.length || /\b(?:require|import)\(\s*["'`]react/.test(worker.code)) problems.push(`worker ${worker.fileName} imports ${worker.imports.join(", ") || "react"}`);
  }

  for (const name of existsSync(OUT) ? readdirSync(OUT) : []) if (name !== ".build") rmSync(join(OUT, name), { recursive: true, force: true });
  const license = ["LICENSE", "NOTICE.md", "THIRD_PARTY_NOTICES.md"].filter((name) => existsSync(join(ROOT, name)));
  const repo = { type: "git", url: "git+https://github.com/XinaTian/MROffice.git" };
  const sizes = {};

  for (const pkg of PACKAGES) {
    const info = CONFIG.packages[pkg];
    const dir = join(OUT, info.name);
    mkdirSync(join(dir, "dist/chunks"), { recursive: true });
    for (const chunk of graph.chunks) {
      if (owner.get(chunk.fileName) !== pkg) continue;
      let code = relinked(chunk, owner);
      checkCode(`${info.name}/${chunk.fileName}`, code);
      if (chunk.isEntry) code = `"use client";\n${code}`;
      writeFileSync(join(dir, "dist", chunk.isEntry ? "index.js" : chunk.fileName), code);
    }
    const dts = readFileSync(join(HERE, "types", `${pkg}.d.ts`), "utf8");
    writeFileSync(join(dir, "dist/index.d.ts"), dts);
    const entry = graph.chunks.find((chunk) => chunk.isEntry && chunk.name === pkg);
    const exported = exportNames(entry.code);
    const declared = declaredNames(dts);
    const untyped = [...exported].filter((name) => !declared.has(name));
    const phantom = [...declared].filter((name) => !exported.has(name));
    if (untyped.length) problems.push(`${info.name}: exports without a type in types/${pkg}.d.ts: ${untyped.join(", ")}`);
    if (phantom.length) problems.push(`${info.name}: types/${pkg}.d.ts declares what the module does not export: ${phantom.join(", ")}`);
    writeFileSync(join(dir, "style.css"), css.cdn);
    writeFileSync(join(dir, "style.self-hosted.css"), css.selfHosted);
    for (const name of license) cpSync(join(ROOT, name), join(dir, name));
    writeFileSync(join(dir, "README.md"), readmeFor(pkg, CONFIG, VERSION));
    const manifest = {
      name: info.name,
      version: VERSION,
      description: info.description,
      keywords: info.keywords,
      license: "AGPL-3.0-only",
      homepage: "https://mroffice.ai/developers",
      repository: { ...repo, directory: `packages/${pkg}` },
      bugs: { url: "https://github.com/XinaTian/MROffice/issues" },
      type: "module",
      main: "./dist/index.js",
      module: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js", default: "./dist/index.js" },
        "./style.css": "./style.css",
        "./style.self-hosted.css": "./style.self-hosted.css",
        "./dist/*": "./dist/*",
        "./package.json": "./package.json",
      },
      files: ["dist", "style.css", "style.self-hosted.css", ...license.filter((name) => name !== "LICENSE")],
      ...(pkg === "core" ? {} : { dependencies: { [npmName("core")]: VERSION } }),
      peerDependencies: { react: ">=19", "react-dom": ">=19" },
    };
    writeFileSync(join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    sizes[info.name] = dir;
  }

  // every import of a package's chunk names a file that package has
  for (const pkg of PACKAGES) {
    const dir = join(OUT, npmName(pkg));
    for (const file of walk(join(dir, "dist")).filter((path) => path.endsWith(".js"))) {
      const code = readFileSync(file, "utf8");
      for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)(["'`])((?:\.{1,2}\/|mroffice-[a-z]+\/)[^"'`\s]+?\.js)\1/g)) {
        const spec = match[2];
        const target = spec.startsWith(".") ? resolve(dirname(file), spec) : join(OUT, spec.split("/")[0], spec.split("/").slice(1).join("/"));
        if (!existsSync(target)) problems.push(`${relative(OUT, file)} imports ${spec}, which is not there`);
      }
    }
  }

  // mroffice-assets: the public files, the fonts the stylesheets name, the interface text
  const assets = join(OUT, CONFIG.assets.name);
  mkdirSync(assets, { recursive: true });
  for (const name of readdirSync(PUBLIC)) cpSync(join(PUBLIC, name), join(assets, name), { recursive: true });
  for (const file of css.faceFiles) if (file.startsWith("assets/")) cpSync(join(BUILD, file), join(assets, file));
  for (const asset of graph.assets) {
    if (asset.fileName.endsWith(".css") || css.faceFiles.includes(asset.fileName)) continue;
    problems.push(`${asset.fileName}: a file the build emitted that neither a stylesheet nor the packages name`);
  }
  writeFileSync(join(assets, "fonts.css"), css.fonts);
  mkdirSync(join(assets, "pathkit"), { recursive: true });
  for (const name of PATHKIT) cpSync(join(dirname(require.resolve("pathkit-wasm/package.json")), "bin", name), join(assets, "pathkit", name));
  for (const { locale, namespaces } of messageLocales) {
    if (locale === "en") continue;
    mkdirSync(join(assets, "messages", locale), { recursive: true });
    for (const ns of namespaces) cpSync(join(ROOT, "packages/core/src/messages", locale, `${ns}.json`), join(assets, "messages", locale, `${ns}.json`));
  }
  for (const name of license) cpSync(join(ROOT, name), join(assets, name));
  writeFileSync(join(assets, "README.md"), assetsReadme(CONFIG, VERSION));
  writeFileSync(
    join(assets, "package.json"),
    `${JSON.stringify(
      {
        name: CONFIG.assets.name,
        version: VERSION,
        description: CONFIG.assets.description,
        keywords: ["mroffice", "fonts", "assets"],
        license: "AGPL-3.0-only",
        homepage: "https://mroffice.ai/developers",
        repository: { ...repo, directory: "apps/playground/public" },
        bugs: { url: "https://github.com/XinaTian/MROffice/issues" },
        files: readdirSync(assets).filter((name) => !["package.json", "README.md", "LICENSE"].includes(name)),
      },
      null,
      2,
    )}\n`,
  );
  // what the code asks of the assets is there
  for (const [, find, , replace, flags] of ASSET_LITERALS) {
    if (flags?.absent) continue;
    const path = (replace ?? find).match(/"(\/[^"]+)"/)[1].replace(/\?.*$/, "");
    if (!existsSync(join(assets, path))) problems.push(`mroffice-assets has no ${path} (the code fetches it)`);
  }
  return sizes;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const dirSize = (dir) => walk(dir).reduce((sum, file) => sum + statSync(file).size, 0);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function finish(stage) {
  // every file the patches name was built
  for (const [file, find] of ASSET_LITERALS) if (!applied.get(`${file} ${find}`)) problems.push(`packages/${file}: not in the build (a patch names it: update scripts/npm/pack.mjs)`);
  for (const [file] of ASSET_WORKERS) if (!applied.get(`${file} new Worker(`)) problems.push(`packages/${file}: not in the build (a patch names it)`);
  if (problems.length) {
    console.error(`\npack:npm stopped (${stage}):\n  ${[...new Set(problems)].join("\n  ")}`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------ run

console.log(`building ${PACKAGES.map(npmName).join(", ")} ${VERSION} ...`);
const started = Date.now();
await runBuild();
console.log(`built in ${Math.round((Date.now() - started) / 1000)} s: ${graph.chunks.length} chunks, ${graph.workers.length} worker bundles`);
finish("build");
const dirs = assemble();
finish("packages");
rmSync(WORK, { recursive: true, force: true });

const rows = [];
for (const name of [...Object.keys(dirs), CONFIG.assets.name]) rows.push([name, dirSize(join(OUT, name))]);
if (!flag("--no-pack")) {
  const tarballs = join(OUT, "tarballs");
  mkdirSync(tarballs, { recursive: true });
  for (const row of rows) {
    const output = execFileSync("npm", ["pack", "--json", "--pack-destination", tarballs], { cwd: join(OUT, row[0]), encoding: "utf8" });
    const [packed] = JSON.parse(output);
    row.push(statSync(join(tarballs, packed.filename)).size, packed.entryCount, packed.filename);
  }
}
for (const note of notes) console.log(`note: ${note}`);
console.log(`\n${"package".padEnd(18)}${"files".padStart(12)}${"tarball".padStart(12)}`);
for (const [name, unpacked, packed, entries] of rows) console.log(`${name.padEnd(18)}${mb(unpacked).padStart(12)}${(packed ? mb(packed) : "-").padStart(12)}${entries ? `  ${entries} files` : ""}`);
console.log(`\nwritten to ${relative(ROOT, OUT)}/; to publish, mroffice-core first, then the others in any order:`);
for (const name of [npmName("core"), ...EDITORS.map(npmName), CONFIG.assets.name]) console.log(`  (cd ${relative(ROOT, join(OUT, name))} && npm publish --access public --auth-type=web)`);
