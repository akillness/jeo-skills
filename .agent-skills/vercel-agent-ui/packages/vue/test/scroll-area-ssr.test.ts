// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaScrollToEnd,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a scroll area", () => {
  const render = () =>
    renderToString(
      createSSRApp({
        render: () =>
          h(ScrollArea, { stickToEnd: true }, () => [
            h(ScrollAreaViewport, { "aria-label": "Messages" }, () =>
              h(ScrollAreaContent, () => "Hello")
            ),
            h(ScrollAreaScrollbar, () => h(ScrollAreaThumb)),
            h(ScrollAreaScrollToEnd, () => "Jump to latest"),
          ]),
      })
    )

  test("the viewport scrolls and hides native scrollbars already, so they never flash", async () => {
    const html = await render()
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(
      /data-slot="scroll-area-viewport"[^>]*style="overflow:auto;scrollbar-width:none;?"/
    )
  })

  test("the scrollbar is hidden from screen readers, and from view until the content is measured", async () => {
    const html = await render()
    expect(html).toMatch(/aria-hidden="true"[^>]*data-orientation="vertical"/)
    expect(html).toMatch(/data-slot="scroll-area-scrollbar"[^>]*display:none/)
  })
})
