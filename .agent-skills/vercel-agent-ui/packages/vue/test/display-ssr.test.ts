// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Meter,
  MeterIndicator,
  MeterTrack,
  MeterValue,
  OTPInput,
  OTPInputSlot,
  Progress,
  ProgressValue,
} from "../src"

const render = (view: () => ReturnType<typeof h>) =>
  renderToString(createSSRApp(view))

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering avatars, progress bars, meters and codes", () => {
  test("an avatar renders its fallback, and its image hidden so it starts loading", async () => {
    const html = await render(() =>
      h(Avatar, null, () => [
        h(AvatarImage, { src: "/ada.png", alt: "Ada" }),
        h(AvatarFallback, null, () => "AL"),
      ])
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/<img[^>]*src="\/ada.png"[^>]*aria-hidden="true"/)
    expect(html).toContain(">AL</span>")
  })

  test("a progress bar renders its value in English until the page's language is known", async () => {
    const html = await render(() =>
      h(Progress, { value: 0.5, max: 1 }, () => h(ProgressValue))
    )
    expect(html).toContain('aria-valuetext="50%"')
    expect(html).toContain(">50%</span>")
  })

  test("a meter renders its value, width and variable before hydration", async () => {
    const html = await render(() =>
      h(Meter, { value: 3, min: 1, max: 5 }, () => [
        h(MeterValue),
        h(MeterTrack, null, () => h(MeterIndicator)),
      ])
    )
    expect(html).toMatch(/role="meter"[^>]*aria-valuenow="3"/)
    expect(html).toContain('aria-valuetext="50%"')
    expect(html).toContain("--meter-value:50%")
    expect(html).toMatch(
      /data-slot="meter-indicator"[^>]*style="[^"]*width:50%/
    )
    expect(html).toContain(">50%</span>")
  })

  test("a code renders one input with its value, and slots with characters", async () => {
    const html = await render(() =>
      h(
        OTPInput,
        { "aria-label": "Code", defaultValue: "12", maxLength: 4 },
        () => [h(OTPInputSlot, { index: 0 }), h(OTPInputSlot, { index: 1 })]
      )
    )
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html).toMatch(/<input[^>]*value="12"/)
    expect(html).toContain(">1</div>")
  })
})
