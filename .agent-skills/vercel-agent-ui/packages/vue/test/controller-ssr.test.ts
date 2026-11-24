// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { createToggleController, Toggle } from "../src/toggle"

// A controller attaches on mount, so a server render reads it before it has a component.
test("a server render can call a controller's methods before it attaches", async () => {
  const toggle = createToggleController()
  const app = createSSRApp(() => [
    h(Toggle, { controller: toggle }, () => "Bold"),
    h("span", String(toggle.isPressed() ?? "")),
  ])
  const html = await renderToString(app)
  expect(html).toContain("Bold")
  expect(html).toContain("<span></span>")
})
