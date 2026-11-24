// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Resizable, ResizableHandle, ResizablePanel } from "../src/resizable"

// Runs with no DOM: any access to window, document or storage during render throws.
describe("server rendering a resizable group", () => {
  test("panels take their default size as their basis, and the rest grow into what's left", () => {
    const html = renderToString(
      <Resizable autoSaveId="editor">
        <ResizablePanel id="sidebar" defaultSize={25} />
        <ResizableHandle aria-label="Resize sidebar" />
        <ResizablePanel id="main" />
        <ResizableHandle aria-label="Resize preview" />
        <ResizablePanel id="preview" defaultSize="240px" />
      </Resizable>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain("flex:0 1 var(--resizable-panel-size, 25%)")
    expect(html).toContain("flex:1 1 var(--resizable-panel-size, 0px)")
    expect(html).toContain("flex:0 1 var(--resizable-panel-size, 240px)")
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).not.toContain("tabindex")
    expect(html).not.toContain("aria-valuenow")
  })
})
