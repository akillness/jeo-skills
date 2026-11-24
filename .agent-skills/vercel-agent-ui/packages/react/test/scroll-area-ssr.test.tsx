// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaScrollToEnd,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "../src/scroll-area"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a scroll area", () => {
  const html = renderToString(
    <ScrollArea stickToEnd>
      <ScrollAreaViewport aria-label="Messages">
        <ScrollAreaContent>Hello</ScrollAreaContent>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar>
        <ScrollAreaThumb />
      </ScrollAreaScrollbar>
      <ScrollAreaScrollToEnd>Jump to latest</ScrollAreaScrollToEnd>
    </ScrollArea>
  )

  test("the viewport scrolls and hides native scrollbars already, so they never flash", () => {
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(
      /data-slot="scroll-area-viewport"[^>]*style="overflow:auto;scrollbar-width:none"/
    )
  })

  test("the scrollbar is hidden from screen readers, and from view until the content is measured", () => {
    expect(html).toMatch(
      /data-slot="scroll-area-scrollbar"[^>]*aria-hidden="true"/
    )
    expect(html).toMatch(/data-slot="scroll-area-scrollbar"[^>]*display:none/)
  })

  test("the content resets the per-frame variables, and the button is a button", () => {
    expect(html).toContain("--scroll-area-overflow-y-start:initial")
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*>Jump to latest<\/button>/
    )
  })
})
