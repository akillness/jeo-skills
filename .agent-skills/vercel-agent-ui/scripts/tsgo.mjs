// Runs TypeScript 7, the native compiler, with the given arguments, from any
// package. Its binary is also `tsc`, so it lives in a package of its own,
// where it can't replace TypeScript 5.9's, which vue-tsc and svelte-check use.
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(
  path.join(import.meta.dirname, "typescript7/package.json")
)
const bin = path.join(
  path.dirname(require.resolve("typescript7/package.json")),
  "bin/tsc"
)
const { status, error } = spawnSync(
  process.execPath,
  [bin, ...process.argv.slice(2)],
  { stdio: "inherit" }
)
if (error) {
  throw error
}
process.exit(status ?? 1)
