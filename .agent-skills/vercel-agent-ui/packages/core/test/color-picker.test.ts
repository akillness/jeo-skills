// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest"
import {
  colorPicker,
  type ColorPickerOptions,
} from "../src/components/color-picker/color-picker"
import { isInGamut } from "../src/foundation/color/gamut"
import { parseColor } from "../src/foundation/color/parse"
import { attrs } from "../src/foundation/kernel/part"

const make = (options: ColorPickerOptions = {}) =>
  colorPicker({ id: "c", ...options })

const key = (key: string, shiftKey = false) =>
  new KeyboardEvent("keydown", { key, shiftKey, cancelable: true })

describe("color picker", () => {
  test("starts black, written as hex in HSV, and shows its color as a variable", () => {
    const picker = make()
    expect(picker.api.getValue()).toBe("#000000")
    expect(attrs(picker.part("root", {}))).toMatchObject({
      role: "group",
      style: "--color-picker-color:hsl(0 0% 0%)",
    })
  })

  test("reads any CSS color and writes the format, fitting sRGB first", () => {
    const picker = make({ format: "hex" })
    expect(picker.api.setValue("oklch(0.7 0.25 150)")).toBe(true)
    expect(picker.api.getValue()).toBe("#00c248")
    expect(picker.api.setValue("not a color")).toBe(false)
    expect(picker.api.getValue()).toBe("#00c248")
  })

  test("the area's thumb names both channels, and a hue survives a trip to gray", () => {
    const picker = make({ defaultValue: "hsl(200 50% 50%)" })
    picker.api.internal.areaKeydown(key("Home"))
    expect(attrs(picker.part("area-thumb", {}))).toMatchObject({
      role: "slider",
      "aria-label": "Saturation and brightness",
      "aria-valuetext": "Saturation 0%, Brightness 75%",
    })
    picker.api.internal.areaKeydown(key("End"))
    expect(
      attrs(picker.part("slider-thumb", { channel: "hue" }))
    ).toMatchObject({
      "aria-valuenow": "200",
      "aria-valuetext": "200 degrees",
    })
  })

  test("a controlled value that comes back as the parts wrote it keeps their color", () => {
    const onValueChange = vi.fn()
    const picker = make({ value: "#bf8040", onValueChange })
    picker.api.internal.areaKeydown(key("Home"))
    const [gray] = onValueChange.mock.lastCall!
    picker.setOptions({ id: "c", value: gray, onValueChange })
    picker.api.internal.areaKeydown(key("End"))
    expect(onValueChange.mock.lastCall![0]).toBe("#bf6000")
  })

  test("a controlled picker commits a key, a swatch and typed text before its owner renders", () => {
    const onValueCommit = vi.fn()
    const picker = make({ value: "#ff0000", onValueCommit })
    picker.api.internal.sliderKeydown(key("ArrowRight", true), "hue")
    picker.api.internal.choose("#00ff00", { reason: "item-press" })
    picker.api.internal.setText("#0000ff")
    picker.api.internal.commitText()
    expect(onValueCommit.mock.calls.map(([value]) => value)).toEqual([
      "#ff2a00",
      "#00ff00",
      "#0000ff",
    ])
  })

  test("sliders step by one, by ten with Shift, and jump to their ends", () => {
    const picker = make({ defaultValue: "hsl(10 100% 50%)" })
    const hue = () =>
      attrs(picker.part("slider-thumb", { channel: "hue" }))["aria-valuenow"]
    picker.api.internal.sliderKeydown(key("ArrowRight"), "hue")
    expect(hue()).toBe("11")
    picker.api.internal.sliderKeydown(key("ArrowUp", true), "hue")
    expect(hue()).toBe("21")
    picker.api.internal.sliderKeydown(key("End"), "hue")
    expect(hue()).toBe("360")
  })

  test("a slider's track draws its channel, and alpha keeps its transparency", () => {
    const picker = make({ defaultValue: "#ff0000" })
    const style = (channel: "hue" | "alpha") =>
      attrs(picker.part("slider", { channel })).style
    expect(style("hue")).toContain(
      "--color-slider-background:linear-gradient(to right, hsl(0 100% 50%)"
    )
    expect(style("alpha")).toContain("hsl(0 100% 50% / 0), hsl(0 100% 50%))")
  })

  test("in OKLCH, the value stays inside the gamut and the color moves there once a key commits", () => {
    const onValueChange = vi.fn()
    const picker = make({
      space: "oklch",
      defaultValue: "oklch(0.7 0.1 150)",
      onValueChange,
    })
    expect(picker.api.getValue()).toBe("oklch(0.7 0.1 150)")
    picker.api.internal.areaKeydown(key("End"))
    const [value, details] = onValueChange.mock.lastCall!
    expect(isInGamut(parseColor(value)!)).toBe(true)
    expect(details).toMatchObject({
      reason: "step-key",
      color: { space: "oklch" },
    })
    expect(attrs(picker.part("root", {}))["data-out-of-gamut"]).toBeUndefined()
    expect(attrs(picker.part("area-thumb", {}))["aria-valuenow"]).not.toBe(
      "0.4"
    )
  })

  test("in OKLCH, the hue slider edits the hue", () => {
    const picker = make({
      space: "oklch",
      defaultValue: "oklch(0.7 0.1 150)",
      gamut: false,
    })
    expect(
      attrs(picker.part("slider-thumb", { channel: "hue" }))["aria-valuenow"]
    ).toBe("150")
    picker.api.internal.sliderKeydown(key("ArrowRight"), "hue")
    expect(picker.api.getValue()).toBe("oklch(0.7 0.1 151)")
    picker.api.internal.sliderKeydown(key("End"), "hue")
    expect(attrs(picker.part("swatch", {}))["aria-label"]).toBe("pink")
  })

  test("with no gamut, the value is any color", () => {
    const picker = make({
      space: "oklch",
      defaultValue: "oklch(0.7 0.1 150)",
      gamut: false,
    })
    picker.api.internal.areaKeydown(key("End"))
    expect(picker.api.getValue()).toBe("oklch(0.7 0.4 150)")
  })

  test("the input reads a color on commit, and text that isn't one goes back", () => {
    const picker = make()
    picker.api.internal.setText("rebeccapurple")
    expect(attrs(picker.part("input", {})).value).toBe("rebeccapurple")
    picker.api.internal.commitText()
    expect(picker.api.getValue()).toBe("#663399")
    picker.api.internal.setText("purple-ish")
    picker.api.internal.commitText()
    expect(picker.api.getValue()).toBe("#663399")
    expect(attrs(picker.part("input", {})).value).toBe("#663399")
  })

  test("a channel input edits one channel in its own units", () => {
    const picker = make({ space: "srgb", defaultValue: "rgb(10 20 30)" })
    expect(
      attrs(picker.part("channel-input", { channel: "red" }))
    ).toMatchObject({
      type: "number",
      max: "255",
      value: "10",
      "aria-label": "Red",
    })
    picker.api.internal.setChannelValue("red", 255, new Event("change"))
    expect(picker.api.getValue()).toBe("rgb(255 20 30)")
    const hue = make({ defaultValue: "#3b82f6" }).part("channel-input", {
      channel: "hue",
    })
    expect(attrs(hue)).toMatchObject({ step: "1", value: "217" })
  })

  test("a swatch is selected by the color it shows, whatever it's written in", () => {
    const picker = make({ defaultValue: "#0000ff" })
    expect(
      attrs(picker.part("swatch-item", { value: "rgb(0 0 255)" }))
    ).toMatchObject({
      role: "option",
      "aria-selected": "true",
      "aria-label": "vivid blue",
    })
    const red = picker.part("swatch-item", { value: "#ff0000" })
    expect(attrs(red)["aria-selected"]).toBe("false")
    picker.api.internal.choose("#ff0000", { reason: "item-press" })
    expect(picker.api.getValue()).toBe("#ff0000")
    expect(attrs(picker.part("swatch", {}))).toMatchObject({
      role: "img",
      "aria-label": "vivid red",
    })
  })

  test("a swatch writes its color variable only when the value is a color", () => {
    const picker = make()
    expect(
      attrs(picker.part("swatch-item", { value: "rgb(0 0 255)" })).style
    ).toBe("--color-picker-color:rgb(0 0 255)")
    expect(
      attrs(picker.part("swatch-item", { value: "red;position:fixed;inset:0" }))
        .style
    ).toBe("")
  })

  test("a swatch outside the gamut is selected once chosen", () => {
    const picker = make({ space: "oklch", format: "oklch" })
    const vivid = "oklch(0.7 0.3 150)"
    picker.api.internal.choose(vivid, { reason: "item-press" })
    expect(
      attrs(picker.part("swatch-item", { value: vivid }))["aria-selected"]
    ).toBe("true")
    const hsv = make({ gamut: "p3" })
    hsv.api.internal.choose(vivid, { reason: "item-press" })
    expect(
      attrs(hsv.part("swatch-item", { value: vivid }))["aria-selected"]
    ).toBe("true")
  })

  test("a canceled change leaves the value and the parts as they were", () => {
    const picker = make({
      defaultValue: "hsl(120 100% 50%)",
      onValueChange: (_value, details) => details.cancel(),
    })
    picker.api.internal.sliderKeydown(key("End"), "hue")
    expect(picker.api.getValue()).toBe("hsl(120 100% 50%)")
    expect(
      attrs(picker.part("slider-thumb", { channel: "hue" }))["aria-valuenow"]
    ).toBe("120")
  })

  test("disabled and read-only pickers don't change", () => {
    for (const options of [{ disabled: true }, { readOnly: true }]) {
      const picker = make({ defaultValue: "#ff0000", ...options })
      picker.api.internal.sliderKeydown(key("End"), "hue")
      picker.api.internal.choose("#00ff00", { reason: "item-press" })
      expect(picker.api.getValue()).toBe("#ff0000")
    }
    expect(
      attrs(make({ readOnly: true }).part("area-thumb", {}))
    ).toMatchObject({
      tabindex: "0",
      "aria-readonly": "true",
    })
  })

  test("a drag on the area or a slider stops once the picker turns read-only", async () => {
    const pointer = (type: string, clientX: number) =>
      new PointerEvent(type, {
        pointerId: 1,
        button: 0,
        buttons: 1,
        clientX,
        clientY: 50,
        cancelable: true,
      })
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    for (const press of ["areaPointerdown", "sliderPointerdown"] as const) {
      const onValueCommit = vi.fn()
      const options = { defaultValue: "hsl(0 100% 50%)", onValueCommit }
      const picker = make(options)
      const el = document.body.appendChild(document.createElement("div"))
      el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100)
      picker.api.internal[press](pointer("pointerdown", 20), el, "hue")
      document.dispatchEvent(pointer("pointermove", 40))
      await frame()
      const held = picker.api.getValue()
      picker.setOptions({ id: "c", ...options, readOnly: true })
      document.dispatchEvent(pointer("pointermove", 90))
      await frame()
      document.dispatchEvent(pointer("pointerup", 90))
      expect(picker.api.getValue()).toBe(held)
      expect(onValueCommit).toHaveBeenCalledTimes(1)
      picker.destroy()
    }
  })
})
