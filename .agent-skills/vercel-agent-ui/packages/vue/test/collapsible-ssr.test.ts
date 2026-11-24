// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../src"

const render = (
  props: Record<string, unknown>,
  panel: Record<string, unknown> = {}
) =>
  renderToString(
    createSSRApp(() =>
      h(Collapsible, props, () => [
        h(CollapsibleTrigger, null, () => "Details"),
        h(CollapsiblePanel, panel, () => "Panel"),
      ])
    )
  )

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a collapsible", () => {
  test("renders an open panel with its content", async () => {
    const html = await render({ defaultOpen: true })
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/aria-expanded="true"[^>]*>Details/)
    expect(html).toContain("Panel")
  })

  test("leaves a closed panel out", async () => {
    expect(await render({})).not.toContain("Panel")
  })

  test("renders a findable panel as hidden until found, so find in page works before hydration", async () => {
    expect(await render({}, { hiddenUntilFound: true })).toMatch(
      /<div[^>]*hidden="until-found"[^>]*>Panel/
    )
  })
})
