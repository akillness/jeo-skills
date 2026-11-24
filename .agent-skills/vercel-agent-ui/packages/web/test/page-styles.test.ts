// @vitest-environment jsdom
import { expect, test, vi } from "vitest"

test("two copies of the package on one page keep each other's default rules", async () => {
  const first = await import("../src/field")
  first.defineFieldElements()
  vi.resetModules()
  const second = await import("../src/tabs")
  second.defineTabsElements()
  const rules = Array.from(
    document.head.querySelectorAll("style"),
    (style) => style.textContent
  ).join("\n")
  expect(rules).toContain("ui-field")
  expect(rules).toContain("ui-tabs")
})
