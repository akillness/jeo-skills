// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPlayToggle,
  CarouselPrevious,
  CarouselViewport,
} from "../src/carousel"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a carousel", () => {
  test("renders the pattern's roles and native snapping, so it pages before hydration", () => {
    const html = renderToString(
      <Carousel aria-label="Featured" defaultPage={2}>
        <CarouselViewport>
          <CarouselContent>
            <CarouselItem>One</CarouselItem>
            <CarouselItem>Two</CarouselItem>
          </CarouselContent>
        </CarouselViewport>
        <CarouselPrevious>Previous</CarouselPrevious>
        <CarouselNext>Next</CarouselNext>
        <CarouselIndicatorGroup aria-label="Choose a slide">
          <CarouselIndicator page={1}>1</CarouselIndicator>
          <CarouselIndicator page={2}>2</CarouselIndicator>
        </CarouselIndicatorGroup>
      </Carousel>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-roledescription="carousel"')
    expect(html).toContain('aria-roledescription="slide"')
    expect(html).toContain("scroll-snap-type:x mandatory")
    expect(html).toContain("scroll-snap-align:start")
    expect(html).toMatch(/aria-selected="true"[^>]*>2</)
    // Slides aren't hidden until they're measured, so nothing is lost without JavaScript.
    expect(html).not.toContain("inert")
  })

  test("a rotating carousel renders its toggle's state and turns the live region off", () => {
    const html = renderToString(
      <Carousel aria-label="Featured" defaultPlaying>
        <CarouselPlayToggle>
          {(state) => (state.playing ? "Stop" : "Start")}
        </CarouselPlayToggle>
        <CarouselViewport>
          <CarouselContent>
            <CarouselItem>One</CarouselItem>
          </CarouselContent>
        </CarouselViewport>
      </Carousel>
    )
    expect(html).toContain(">Stop<")
    expect(html).toContain('aria-live="off"')
  })
})
