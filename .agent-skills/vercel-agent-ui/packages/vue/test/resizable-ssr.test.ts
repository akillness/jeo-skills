// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { Resizable, ResizableHandle, ResizablePanel } from "../src"

const render = (node: () => unknown) =>
  renderToString(createSSRApp(() => node()))

// Runs with no DOM: any access to window, document or storage during render throws.
describe("server rendering a resizable group", () => {
  test("panels take their default size as their basis, and the rest grow into what's left", async () => {
    const html = await render(() =>
      h(Resizable, { autoSaveId: "editor", orientation: "vertical" }, () => [
        h(ResizablePanel, { id: "code", defaultSize: 70 }),
        h(ResizableHandle, { "aria-label": "Resize terminal" }),
        h(ResizablePanel, { id: "terminal" }),
      ])
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain("flex:0 1 var(--resizable-panel-size, 70%)")
    expect(html).toContain("flex:1 1 var(--resizable-panel-size, 0px)")
    expect(html).toContain('aria-orientation="horizontal"')
    expect(html).toContain("flex-direction:column")
  })
})
