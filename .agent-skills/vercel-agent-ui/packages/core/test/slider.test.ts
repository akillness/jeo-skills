import { describe, expect, test, vi } from "vitest"
import { createSliderController, slider } from "../src/components/slider/slider"
import {
  keyTarget,
  moveThumb,
  percentOf,
  thumbBounds,
  thumbForDirection,
  thumbForPress,
} from "../src/components/slider/slider-values"
import { attrs, partState } from "../src/foundation/kernel/part"
import { kept } from "./kept"

const range = {
  min: 0,
  max: 100,
  step: 1,
  largeStep: 10,
  minStepsBetweenThumbs: 0,
}

describe("slider values", () => {
  test("keeps thumbs between their neighbours, apart by the minimum distance", () => {
    const spaced = { ...range, minStepsBetweenThumbs: 5 }
    expect(thumbBounds([20, 80], 0, spaced)).toEqual({ lower: 0, upper: 75 })
    expect(thumbBounds([20, 80], 1, spaced)).toEqual({ lower: 25, upper: 100 })
    expect(moveThumb([20, 80], 0, 90, spaced)).toEqual([75, 80])
  })

  test("keeps thumbs within the bounds when they're too close for the minimum distance", () => {
    const spaced = { ...range, minStepsBetweenThumbs: 1 }
    expect(thumbBounds([0, 0], 0, spaced)).toEqual({ lower: 0, upper: 0 })
    expect(moveThumb(moveThumb([0, 0], 0, 0, spaced), 1, 0, spaced)).toEqual([
      0, 1,
    ])
    expect(thumbBounds([100, 100, 100], 2, spaced)).toEqual({
      lower: 100,
      upper: 100,
    })
  })

  test("returns the same array when a thumb doesn't move", () => {
    const values = [20, 80]
    expect(moveThumb(values, 0, 20.2, range)).toBe(values)
  })

  test("maps keys the APG way, with Left and Right flipped right to left", () => {
    const bounds = { lower: 0, upper: 100 }
    expect(keyTarget("ArrowRight", {}, 50, bounds, range)).toBe(51)
    expect(keyTarget("ArrowUp", {}, 50, bounds, range)).toBe(51)
    expect(keyTarget("ArrowRight", { rtl: true }, 50, bounds, range)).toBe(49)
    expect(keyTarget("ArrowUp", { rtl: true }, 50, bounds, range)).toBe(51)
    expect(
      keyTarget(
        "ArrowRight",
        { rtl: true, orientation: "vertical" },
        50,
        bounds,
        range
      )
    ).toBe(51)
    expect(keyTarget("ArrowLeft", { shiftKey: true }, 50, bounds, range)).toBe(
      40
    )
    expect(keyTarget("PageUp", {}, 95, bounds, range)).toBe(100)
    expect(keyTarget("Home", {}, 50, { lower: 20, upper: 80 }, range)).toBe(20)
    expect(keyTarget("Tab", {}, 50, bounds, range)).toBe(null)
  })

  test("a press picks the nearest thumb, and the side of a stack", () => {
    expect(thumbForPress([20, 80], 30)).toEqual({ index: 0, stack: [0] })
    expect(thumbForPress([50, 50], 40)).toEqual({ index: 0, stack: [0, 1] })
    expect(thumbForPress([50, 50], 60)).toEqual({ index: 1, stack: [0, 1] })
    expect(thumbForPress([50, 50], 50)).toEqual({ index: null, stack: [0, 1] })
    expect(thumbForDirection([0, 1], -1)).toBe(0)
    expect(thumbForDirection([0, 1], 1)).toBe(1)
  })

  test("positions are percentages of the range", () => {
    expect(percentOf(25, { min: 0, max: 200, step: 1 })).toBe(12.5)
    expect(percentOf(1 / 3, { min: 0, max: 1, step: 0.01 })).toBe(33.3333)
  })
})

describe("slider", () => {
  test("renders a thumb's value and its neighbour bounds on its input", () => {
    const instance = slider({ id: "s", defaultValue: [20, 80] })
    expect(
      attrs(instance.part("thumb-input", { id: "1", index: 1 }))
    ).toMatchObject({
      type: "range",
      id: "s-thumb-1",
      min: "20",
      max: "100",
      value: "80",
      "aria-valuetext": "80",
    })
    // A box as wide as the track, centered on 20%, which the thumb centers in.
    // The same in either direction, so the server's markup is right before hydration.
    expect(
      attrs(instance.part("thumb", { id: "0", index: 0 })).style
    ).toContain("inset-inline:calc(20% - 50%) calc(50% - 20%)")
    expect(attrs(instance.part("indicator")).style).toContain("width:60%")
  })

  test("formats the value text in the locale", () => {
    const instance = slider({
      id: "s",
      defaultValue: 1500,
      max: 5000,
      locale: "de-DE",
      format: { style: "currency", currency: "EUR" },
    })
    expect(
      attrs(instance.part("thumb-input", { id: "0", index: 0 }))[
        "aria-valuetext"
      ]
    ).toBe("1.500,00\u00a0€")
    expect(partState(instance.part("value")).text).toBe("1.500,00\u00a0€")
  })

  test("shows as many decimals as the step, so small steps never read as 0", () => {
    const fine = slider({
      id: "s",
      defaultValue: 0.0004,
      max: 0.01,
      step: 0.0001,
    })
    expect(
      attrs(fine.part("thumb-input", { id: "0", index: 0 }))["aria-valuetext"]
    ).toBe("0.0004")
    const percent = slider({
      id: "p",
      defaultValue: 0.005,
      max: 1,
      step: 0.001,
      format: { style: "percent" },
    })
    expect(partState(percent.part("value")).text).toBe("0.5%")
    const own = slider({
      id: "o",
      defaultValue: 4,
      format: { maximumFractionDigits: 0 },
      step: 0.5,
    })
    expect(partState(own.part("value")).text).toBe("4")
  })

  test("submits a range as start/end", () => {
    const instance = slider({ id: "s", name: "price", defaultValue: [20, 80] })
    expect(attrs(instance.part("input"))).toMatchObject({
      type: "hidden",
      name: "price",
      value: "20/80",
    })
  })

  test("a controller sets the value clamped, snapped and sorted", () => {
    const controller = createSliderController<number[]>()
    const onValueChange = vi.fn()
    const instance = kept(
      slider({ id: "s", defaultValue: [10, 20], controller, onValueChange })
    )
    instance.setOptions({
      id: "s",
      defaultValue: [10, 20],
      controller,
      onValueChange,
    })
    expect(controller.setValue([90.4, 120])).toBe(true)
    expect(instance.get().value).toEqual([90, 100])
    expect(onValueChange.mock.calls[0][1].reason).toBe("imperative")
  })

  test("a controller can't change a disabled or read-only slider", () => {
    for (const locked of [{ disabled: true }, { readOnly: true }]) {
      const controller = createSliderController()
      const instance = kept(
        slider({ id: "s", defaultValue: 10, controller, ...locked })
      )
      expect(controller.setValue(50)).toBe(false)
      expect(instance.get().value).toBe(10)
    }
  })

  test("keeps an uncontrolled value inside its range when the bounds change", () => {
    const single = kept(slider({ id: "s", name: "volume", defaultValue: 80 }))
    single.setOptions({ id: "s", name: "volume", defaultValue: 80, max: 50 })
    expect(single.get().value).toBe(50)
    expect(attrs(single.part("input")).value).toBe("50")
    expect(
      attrs(single.part("thumb-input", { id: "0", index: 0 }))["aria-valuetext"]
    ).toBe("50")
    const range = kept(slider({ id: "r", defaultValue: [20, 80] }))
    range.setOptions({ id: "r", defaultValue: [20, 80], min: 30, max: 60 })
    expect(range.get().value).toEqual([30, 60])
    range.setOptions({
      id: "r",
      defaultValue: [20, 80],
      min: 30,
      max: Number.NaN,
    })
    expect(range.get().value).toEqual([30, 60])
  })

  test.each([
    { value: 10, other: 30 },
    { value: [10, 20], other: [30, 40] },
  ])(
    "a preview it drops leaves the same value handed over unchanged: $value",
    ({ value, other }) => {
      const instance = kept(slider({ id: "s", value }))
      instance.setOptions({ id: "s", value })
      expect(instance.preview({ id: "s", value: other })).toBeDefined()
      expect(instance.preview({ id: "s", value })).toBeUndefined()
      const listener = vi.fn()
      instance.subscribe(listener)
      instance.setOptions({ id: "s", value })
      expect(listener).not.toHaveBeenCalled()
    }
  )

  test.each([
    { from: 0, to: -0 },
    { from: -0, to: 0 },
    { from: [0, 1], to: [-0, 1] },
    { from: [-0, 1], to: [0, 1] },
  ])(
    "a thumb's value text follows a change of zero's sign: $from to $to",
    ({ from, to }) => {
      const instance = kept(
        slider({ id: "s", value: from, min: -1, max: 1, locale: "en-US" })
      )
      instance.setOptions({
        id: "s",
        value: to,
        min: -1,
        max: 1,
        locale: "en-US",
      })
      const text = Object.is(Array.isArray(to) ? to[0] : to, -0) ? "-0" : "0"
      expect(
        attrs(instance.part("thumb-input", { id: "0", index: 0 }))[
          "aria-valuetext"
        ]
      ).toBe(text)
    }
  )

  test("keeps a single value a number", () => {
    const onValueChange = vi.fn()
    const instance = slider({ id: "s", defaultValue: 5, onValueChange })
    instance.api.setValue(7)
    expect(onValueChange).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ reason: "imperative" })
    )
  })
})
