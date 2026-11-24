// @vitest-environment jsdom
import { expect, test } from "vitest"
import { carousel } from "../src/components/carousel/carousel"
import { mount, rerenderOf } from "../src/testing/mount"

test("slides grouped into pages snap one by one again once a page holds one slide", async () => {
  const mounted = mount(
    carousel,
    { slidesPerPage: 2 },
    `<root aria-label="Photos"><viewport><content><item>One</item><item>Two</item><item>Three</item><item>Four</item></content></viewport></root>`
  )
  await mounted.settle()
  const slides = [
    ...mounted.root.querySelectorAll<HTMLElement>(
      '[data-slot="carousel-item"]'
    ),
  ]
  expect(
    slides.map((slide) => slide.style.getPropertyValue("scroll-snap-align"))
  ).toContain("none")
  rerenderOf(mounted).setOptions({ slidesPerPage: 1 })
  await mounted.settle()
  expect(
    slides.map((slide) => slide.style.getPropertyValue("scroll-snap-align"))
  ).toEqual(["start", "start", "start", "start"])
  mounted.unmount()
})
