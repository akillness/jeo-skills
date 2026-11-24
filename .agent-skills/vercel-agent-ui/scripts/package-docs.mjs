// Writes the docs as Markdown into each package's docs folder, which the
// published tarballs ship, so the docs reach whoever installs a package.
// The release workflow runs it; run it alone to read what a release will ship.

//   node scripts/package-docs.mjs                   Every package.
//   node scripts/package-docs.mjs react vue         Some.
//   node scripts/package-docs.mjs --elements <dir>  Only the web components'
//                                                   elements manifest, into <dir>.
//
// The web package also gets `custom-elements.json` and `html-custom-data.json`
// (`apps/docs/lib/custom-elements.ts`).
import { build } from "esbuild"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const docs = path.resolve(import.meta.dirname, "../apps/docs")
// Inside node_modules, so the bundle finds the packages it leaves outside.
const cache = path.resolve(import.meta.dirname, "../node_modules/.cache")
mkdirSync(cache, { recursive: true })
const out = mkdtempSync(path.join(cache, "package-docs-"))
try {
  // The docs app's modules are TypeScript with its `@/` paths, so they're
  // bundled to run here. TypeScript, the type table generator and esbuild,
  // which the elements manifest runs the web entries with, stay outside.
  await build({
    entryPoints: [path.join(docs, "lib/package-docs.ts")],
    outfile: path.join(out, "package-docs.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "@": docs },
    external: ["typescript", "fumadocs-typescript", "esbuild"],
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: "warning",
  })
  const args = process.argv.slice(2)
  const elements = args[0] === "--elements" && path.resolve(args[1] ?? ".")
  // Pages are read relative to the docs app, the way the site reads them.
  process.chdir(docs)
  const { writeElementsManifest, writePackageDocs } = await import(
    pathToFileURL(path.join(out, "package-docs.mjs")).href
  )
  if (elements) {
    await writeElementsManifest(elements)
  } else {
    await writePackageDocs(args.length ? args : undefined)
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}
