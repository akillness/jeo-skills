import { build } from "esbuild"
import path from "node:path"
import { describe, expect, test } from "vitest"

// Development-only code comes from `#dev`, which production builds resolve to
// a stub, so warnings and the devtools hook ship no bytes.
const bundle = async (conditions: string[]) => {
  const result = await build({
    entryPoints: [path.join(import.meta.dirname, "../src/index.ts")],
    bundle: true,
    write: false,
    format: "esm",
    minify: true,
    conditions,
    logLevel: "silent",
  })
  return result.outputFiles[0].text
}

describe("production builds", () => {
  test("have no devtools hook, console view or warnings", async () => {
    const production = await bundle(["production"])
    expect(production).not.toContain("ui-sdk.devtools@1")
    expect(production).not.toContain("__UI_SDK__")
    expect(production).not.toContain("console.warn")
  })

  test("development builds have them", async () => {
    const development = await bundle(["development"])
    expect(development).toContain("ui-sdk.devtools@1")
    expect(development).toContain("__UI_SDK__")
  })
})
