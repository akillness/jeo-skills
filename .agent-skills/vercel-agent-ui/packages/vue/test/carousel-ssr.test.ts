// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a carousel", () => {
  test("renders the pattern's roles and native snapping, so it pages before hydration", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Carousel, { "aria-label": "Featured", defaultPage: 2 }, () => [
          h(CarouselViewport, () =>
            h(CarouselContent, () => [
              h(CarouselItem, () => "One"),
              h(CarouselItem, () => "Two"),
            ])
          ),
          h(CarouselPrevious, () => "Previous"),
          h(CarouselNext, () => "Next"),
          h(CarouselIndicatorGroup, { "aria-label": "Choose a slide" }, () => [
            h(CarouselIndicator, { page: 1 }, () => "1"),
            h(CarouselIndicator, { page: 2 }, () => "2"),
          ]),
        ])
      )
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-roledescription="carousel"')
    expect(html).toContain('aria-roledescription="slide"')
    expect(html).toContain("scroll-snap-type:x mandatory")
    expect(html).toMatch(/aria-selected="true"[^>]*>2</)
    expect(html).not.toContain("inert")
  })
})
