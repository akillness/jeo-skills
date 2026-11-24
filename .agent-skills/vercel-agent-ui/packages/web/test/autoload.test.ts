// @vitest-environment node
import { describe, expect, test } from "vitest"
import { componentsBase } from "../src/autoload"

describe("componentsBase", () => {
  test("is the folder named like the loader, beside it", () => {
    expect(componentsBase("https://ui-sdk.dev/web@1.2.0.js").href).toBe(
      "https://ui-sdk.dev/web@1.2.0/"
    )
    expect(componentsBase("https://example.com/vendor/web.js").href).toBe(
      "https://example.com/vendor/web/"
    )
  })

  test("leaves out the script's query and hash", () => {
    expect(componentsBase("https://example.com/vendor/web.js?v=2").href).toBe(
      "https://example.com/vendor/web/"
    )
    expect(componentsBase("https://example.com/vendor/web.js#main").href).toBe(
      "https://example.com/vendor/web/"
    )
  })
})
