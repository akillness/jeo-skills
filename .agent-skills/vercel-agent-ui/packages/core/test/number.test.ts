import { describe, expect, test } from "vitest"
import { displayOptions, formatNumber } from "../src/foundation/number/format"
import {
  isPartialNumber,
  parseNumber,
  parseRange,
} from "../src/foundation/number/parse"
import {
  decimalsOf,
  maxOnGrid,
  snapToStep,
  stepValue,
} from "../src/foundation/number/steps"
import {
  formatNumberRange,
  formatNumberToParts,
  fractionOf,
  scrubTo,
  stepBy,
  stepFromKey,
  valueAt,
  wrap,
} from "../src/foundation/number/number"
import { formatRange } from "../src/components/slider/slider-api"

describe("steps", () => {
  test("counts decimals, exponents included", () => {
    expect(decimalsOf(1)).toBe(0)
    expect(decimalsOf(0.25)).toBe(2)
    expect(decimalsOf(1e-7)).toBe(7)
    expect(decimalsOf(1.5e-7)).toBe(8)
  })

  test("snaps to the grid from min, without floating point noise", () => {
    expect(snapToStep(0.30000000000000004, { min: 0, max: 1, step: 0.1 })).toBe(
      0.3
    )
    expect(snapToStep(7, { min: 1, max: 100, step: 5 })).toBe(6)
    expect(snapToStep(-3.4, { min: -10, max: 10, step: 0.5 })).toBe(-3.5)
  })

  test("never goes past the last step at or below max", () => {
    const range = { min: 0, max: 100, step: 3 }
    expect(maxOnGrid(range)).toBe(99)
    expect(snapToStep(100, range)).toBe(99)
  })

  test("starts the grid at 0 without a min", () => {
    expect(snapToStep(12.37, { min: -Infinity, max: Infinity, step: 1 })).toBe(
      12
    )
    expect(
      snapToStep(12.37, { min: -Infinity, max: Infinity, step: 0.25 })
    ).toBe(12.25)
  })

  test("steps off-grid values onto the grid first, like stepUp()", () => {
    const range = { min: 0, max: 10, step: 1 }
    expect(stepValue(1.5, 1, range)).toBe(2)
    expect(stepValue(1.5, -1, range)).toBe(1)
    expect(stepValue(2, 1, range)).toBe(3)
    expect(stepValue(10, 1, range)).toBe(10)
  })

  test("adds tiny steps exactly", () => {
    let value = 0
    for (let index = 0; index < 3; index++) {
      value = stepValue(value, 1, { min: 0, max: 1, step: 0.1 })
    }
    expect(value).toBe(0.3)
    expect(stepValue(0, 1, { min: 0, max: 1, step: 1e-7 })).toBe(1e-7)
  })

  test("keeps cents on values in the tens of billions", () => {
    const cents = { min: -Infinity, max: Infinity, step: 0.01 }
    expect(snapToStep(98765432101.23, cents)).toBe(98765432101.23)
    expect(stepValue(98765432101.23, 1, cents)).toBe(98765432101.24)
  })
})

describe("formatting", () => {
  test("formats in the locale, or with a function", () => {
    expect(formatNumber(1234.5, "en-US")).toBe("1,234.5")
    expect(formatNumber(1234.5, "de-DE")).toBe("1.234,5")
    expect(formatNumber(3, "en-US", (value) => `${value} items`)).toBe(
      "3 items"
    )
    expect(formatNumber(null)).toBe("")
  })

  test("shows at least as many decimals as the step", () => {
    expect(
      formatNumber(0.0001, "en-US", displayOptions(undefined, 0.0001))
    ).toBe("0.0001")
    expect(formatNumber(1.23456, "en-US", displayOptions(undefined, 1))).toBe(
      "1.235"
    )
    expect(
      formatNumber(0.125, "en-US", displayOptions({ style: "percent" }, 0.001))
    ).toBe("12.5%")
  })

  test("shows a currency's own decimals unless the step needs more", () => {
    const usd = { style: "currency", currency: "USD" } as const
    expect(formatNumber(1.2345, "en-US", displayOptions(usd, 1))).toBe("$1.23")
    expect(
      formatNumber(
        1234.5,
        "en-US",
        displayOptions({ style: "currency", currency: "JPY" }, 1)
      )
    ).toBe("¥1,235")
    expect(formatNumber(1.2345, "en-US", displayOptions(usd, 0.001))).toBe(
      "$1.235"
    )
  })
})

describe("parsing", () => {
  test("reads plain and grouped numbers", () => {
    expect(parseNumber("1234.5", "en-US")).toBe(1234.5)
    expect(parseNumber("1,234.5", "en-US")).toBe(1234.5)
    expect(parseNumber("-.5", "en-US")).toBe(-0.5)
    expect(parseNumber("", "en-US")).toBe(null)
    expect(parseNumber("abc", "en-US")).toBe(null)
    expect(parseNumber("1.2.3", "en-US")).toBe(null)
  })

  test("rejects a group separator after the decimal one", () => {
    expect(parseNumber("1,234.98,7654", "en-US")).toBe(null)
    expect(parseNumber("1,5.3", "de-DE")).toBe(null)
    expect(isPartialNumber("1.5,", "en-US")).toBe(false)
    expect(isPartialNumber("1,234.5", "en-US")).toBe(true)
    expect(parseNumber("1 234,5", "fr-FR")).toBe(1234.5)
  })

  test("reads the locale's separators", () => {
    expect(parseNumber("1.234,5", "de-DE")).toBe(1234.5)
    expect(parseNumber("1 234,5", "fr-FR")).toBe(1234.5)
    expect(parseNumber("1 234,5", "fr-FR")).toBe(1234.5)
    expect(parseNumber("1’234.5", "de-CH")).toBe(1234.5)
  })

  test("reads the locale's decimal separator in formats that show no decimals", () => {
    expect(parseNumber("12,5 %", "de-DE", { style: "percent" })).toBe(0.125)
    expect(parseNumber("1,5", "de-DE", { maximumFractionDigits: 0 })).toBe(1.5)
    expect(parseNumber("1,5", "de-DE", { useGrouping: false })).toBe(1.5)
  })

  test("reads the full-width digits East Asian input methods commit", () => {
    expect(parseNumber("１２", "ja-JP")).toBe(12)
    expect(parseNumber("１２．５", "ja-JP")).toBe(12.5)
    expect(parseNumber("１，２３４", "zh-CN")).toBe(1234)
    expect(parseNumber("－１２", "ja-JP")).toBe(-12)
    expect(
      parseNumber("￥１２", "ja-JP", { style: "currency", currency: "JPY" })
    ).toBe(12)
  })

  test("reads accounting negatives in parentheses", () => {
    const accounting = {
      style: "currency",
      currency: "USD",
      currencySign: "accounting",
    } as const
    expect(parseNumber("($1,234.56)", "en-US", accounting)).toBe(-1234.56)
    expect(isPartialNumber("($1", "en-US", accounting)).toBe(true)
  })

  test("reads a point as the decimal where it doesn't group", () => {
    expect(parseNumber("12.5", "fr-FR")).toBe(12.5)
  })

  test("reads the locale's digits and minus signs", () => {
    expect(parseNumber("١٢٣", "ar-EG")).toBe(123)
    expect(parseNumber("۱۲", "fa-IR")).toBe(12)
    expect(parseNumber("−12", "en-US")).toBe(-12)
  })

  test("reads currency, percent and unit text", () => {
    const usd = { style: "currency", currency: "USD" } as const
    expect(parseNumber("$1,234.50", "en-US", usd)).toBe(1234.5)
    expect(parseNumber("-$5", "en-US", usd)).toBe(-5)
    expect(
      parseNumber("1.234,50 €", "de-DE", { style: "currency", currency: "EUR" })
    ).toBe(1234.5)
    expect(parseNumber("50%", "en-US", { style: "percent" })).toBe(0.5)
    expect(parseNumber("12.5", "en-US", { style: "percent" })).toBe(0.125)
    expect(
      parseNumber("5 km", "en-US", { style: "unit", unit: "kilometer" })
    ).toBe(5)
  })

  test("accepts what could still become a number", () => {
    expect(isPartialNumber("-", "en-US", undefined)).toBe(true)
    expect(isPartialNumber("1.", "en-US", undefined)).toBe(true)
    expect(
      isPartialNumber("$1,2", "en-US", { style: "currency", currency: "USD" })
    ).toBe(true)
    expect(isPartialNumber("1a", "en-US", undefined)).toBe(false)
    expect(
      isPartialNumber("-1", "en-US", undefined, { allowNegative: false })
    ).toBe(false)
  })
})

describe("ranges", () => {
  test("round-trips start/end", () => {
    expect(formatRange([20, 80])).toBe("20/80")
    expect(parseRange("20/80")).toEqual([20, 80])
    expect(parseRange("20/x")).toBe(null)
    expect(parseRange("42")).toEqual([42])
  })
})

describe("@ui-sdk/core/number", () => {
  test("wrap keeps a value in a loop, like an angle or a carousel index", () => {
    expect(wrap(370, 0, 360)).toBe(10)
    expect(wrap(-10, 0, 360)).toBe(350)
    expect(wrap(360, 0, 360)).toBe(0)
    expect(wrap(7, 0, 5)).toBe(2)
    expect(wrap(3, 2, 2)).toBe(2)
  })

  test("stepBy moves by the step, the large step and the small step, and to the bounds", () => {
    const range = { min: 0, max: 10, step: 0.5, largeStep: 2, smallStep: 0.1 }
    expect(stepBy(1, { direction: 1, size: "step" }, range)).toBe(1.5)
    expect(stepBy(1, { direction: -1, size: "large" }, range)).toBe(0)
    expect(stepBy(1, { direction: 1, size: "small" }, range)).toBe(1.1)
    expect(stepBy(9.5, { direction: 1, size: "large" }, range)).toBe(10)
    expect(stepBy(4, { bound: "min" }, range)).toBe(0)
    expect(stepBy(4, { bound: "max" }, { min: 0, max: 10, step: 3 })).toBe(9)
    // Without a large step, it's ten steps; without a small one, the step.
    expect(
      stepBy(0, { direction: 1, size: "large" }, { min: 0, max: 100, step: 1 })
    ).toBe(10)
    expect(
      stepBy(0, { direction: 1, size: "small" }, { min: 0, max: 100, step: 1 })
    ).toBe(1)
  })

  test("fractionOf and valueAt map between values and positions, evenly or along a scale", () => {
    const range = { min: 20, max: 20000 }
    expect(fractionOf(50, { min: 0, max: 200 })).toBe(0.25)
    expect(valueAt(0.25, { min: 0, max: 200 })).toBe(50)
    expect(fractionOf(-5, { min: 0, max: 10 })).toBe(0)
    expect(fractionOf(15, { min: 0, max: 10 })).toBe(1)
    expect(fractionOf(5, { min: 3, max: 3 })).toBe(0)
    // A log scale puts each tenfold at the same distance, as a frequency or volume control does.
    expect(fractionOf(200, { min: 2, max: 2000 }, "log")).toBeCloseTo(2 / 3)
    expect(valueAt(0.5, range, "log")).toBeCloseTo(Math.sqrt(20 * 20000))
    expect(valueAt(fractionOf(1234, range, "log"), range, "log")).toBeCloseTo(
      1234
    )
    const squared = {
      to: (value: number) => Math.sqrt(value),
      from: (position: number) => position * position,
    }
    expect(fractionOf(25, { min: 0, max: 100 }, squared)).toBe(0.5)
    expect(valueAt(0.5, { min: 0, max: 100 }, squared)).toBe(25)
  })

  test("formatNumberRange writes what both ends share once, and a format function joins its texts", () => {
    expect(
      formatNumberRange(5, 10, "en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    ).toMatch(/^\$5\s?[–-]\s?\$?10$/)
    expect(formatNumberRange(1, 3, "en-US", (value) => `${value} km`)).toBe(
      "1 km – 3 km"
    )
    expect(formatNumberRange(1, Number.NaN, "en-US")).toBe("")
  })

  test("a long unit or currency name reads back in every plural form", () => {
    const km = {
      style: "unit",
      unit: "kilometer",
      unitDisplay: "long",
    } as const
    for (const [locale, values] of [
      ["ru", [1, 2, 5, 21, 50, 1.5]],
      ["pl", [1, 2, 5, 22, 1.5]],
    ] as const) {
      for (const value of values) {
        expect(parseNumber(formatNumber(value, locale, km), locale, km)).toBe(
          value
        )
      }
    }
    const euro = {
      style: "currency",
      currency: "EUR",
      currencyDisplay: "name",
    } as const
    expect(parseNumber(formatNumber(2, "lt", euro), "lt", euro)).toBe(2)
  })

  test("a value a locale writes as a word alone reads back, with its sign", () => {
    const days = { style: "unit", unit: "day", unitDisplay: "long" } as const
    for (const locale of ["ar", "he"]) {
      for (const value of [2, -2, 3]) {
        const text = formatNumber(value, locale, days)
        expect(parseNumber(text, locale, days)).toBe(value)
        expect(isPartialNumber(text, locale, days)).toBe(true)
      }
    }
    expect(formatNumber(-2, "ar", days)).not.toBe(formatNumber(2, "ar", days))
    const whole = { ...days, maximumFractionDigits: 0 }
    expect(parseNumber(formatNumber(2, "ar", whole), "ar", whole)).toBe(2)
    const hanidec = { numberingSystem: "hanidec" }
    expect(formatNumber(-2, "zh", hanidec)).toBe(
      new Intl.NumberFormat("zh", hanidec).format(-2)
    )
  })

  test("formatNumberRange writes both ends whole when both are negative", () => {
    expect(formatNumberRange(-0.05, -0.02, "en-US", { style: "percent" })).toBe(
      "-5% – -2%"
    )
  })

  test("formatNumberToParts splits a value into its digits and symbols", () => {
    const parts = formatNumberToParts(1234.5, "en-US", {
      style: "currency",
      currency: "USD",
    })
    expect(parts.map((part) => part.type)).toEqual([
      "currency",
      "integer",
      "group",
      "integer",
      "decimal",
      "fraction",
    ])
    expect(parts.map((part) => part.value).join("")).toBe("$1,234.50")
    expect(formatNumberToParts(2, "en-US", (value) => `${value}×`)).toEqual([
      { type: "literal", value: "2×" },
    ])
    expect(formatNumberToParts(null)).toEqual([])
  })

  test("stepFromKey leaves keys an input method is composing with alone, Safari's last one too", () => {
    expect(stepFromKey({ key: "ArrowDown", isComposing: true })).toBe(null)
    expect(stepFromKey({ key: "ArrowDown", keyCode: 229 })).toBe(null)
    expect(
      stepFromKey({ key: "ArrowDown", nativeEvent: { isComposing: true } })
    ).toBe(null)
    expect(
      stepFromKey({
        key: "ArrowDown",
        nativeEvent: { isComposing: false, keyCode: 40 },
      })
    ).toEqual({
      direction: -1,
      size: "step",
    })
  })

  test("stepFromKey reads the APG keys into a move", () => {
    expect(stepFromKey({ key: "ArrowUp" })).toEqual({
      direction: 1,
      size: "step",
    })
    expect(stepFromKey({ key: "ArrowRight" })).toEqual({
      direction: 1,
      size: "step",
    })
    expect(stepFromKey({ key: "ArrowLeft", shiftKey: true })).toEqual({
      direction: -1,
      size: "large",
    })
    expect(stepFromKey({ key: "ArrowDown", altKey: true })).toEqual({
      direction: -1,
      size: "small",
    })
    expect(stepFromKey({ key: "PageUp" })).toEqual({
      direction: 1,
      size: "large",
    })
    expect(stepFromKey({ key: "PageDown" })).toEqual({
      direction: -1,
      size: "large",
    })
    expect(stepFromKey({ key: "Home" })).toEqual({ bound: "min" })
    expect(stepFromKey({ key: "End" })).toEqual({ bound: "max" })
    expect(stepFromKey({ key: "a" })).toBeNull()
  })

  test("right to left flips Left and Right only on a horizontal control, and a field leaves them to the caret", () => {
    expect(stepFromKey({ key: "ArrowRight" }, { dir: "rtl" })).toEqual({
      direction: -1,
      size: "step",
    })
    expect(stepFromKey({ key: "ArrowLeft" }, { dir: "rtl" })).toEqual({
      direction: 1,
      size: "step",
    })
    expect(
      stepFromKey(
        { key: "ArrowRight" },
        { dir: "rtl", orientation: "vertical" }
      )
    ).toEqual({
      direction: 1,
      size: "step",
    })
    expect(stepFromKey({ key: "ArrowUp" }, { dir: "rtl" })).toEqual({
      direction: 1,
      size: "step",
    })
    expect(stepFromKey({ key: "ArrowLeft" }, { arrows: "vertical" })).toBeNull()
    expect(stepFromKey({ key: "ArrowUp" }, { arrows: "vertical" })).toEqual({
      direction: 1,
      size: "step",
    })
  })

  test("a key's move applied with stepBy is what a slider does", () => {
    const range = { min: 0, max: 100, step: 5, largeStep: 20 }
    const press = (key: string, value: number, shiftKey = false) => {
      const move = stepFromKey({ key, shiftKey })
      return move && stepBy(value, move, range)
    }
    expect(press("ArrowRight", 50)).toBe(55)
    expect(press("ArrowRight", 50, true)).toBe(70)
    expect(press("End", 50)).toBe(100)
    expect(press("Tab", 50)).toBeNull()
  })

  test("arrows: horizontal leaves Up and Down to the page", () => {
    expect(stepFromKey({ key: "ArrowUp" }, { arrows: "horizontal" })).toBeNull()
    expect(
      stepFromKey({ key: "ArrowDown" }, { arrows: "horizontal" })
    ).toBeNull()
    expect(
      stepFromKey({ key: "ArrowRight" }, { arrows: "horizontal" })
    ).toEqual({
      direction: 1,
      size: "step",
    })
    expect(
      stepFromKey({ key: "ArrowRight" }, { arrows: "horizontal", dir: "rtl" })
    ).toEqual({
      direction: -1,
      size: "step",
    })
  })
})

describe("scrubbing", () => {
  // A minute-long timeline with sections, landing within 1.5 seconds of each.
  const timeline = {
    min: 0,
    max: 60,
    step: 0.1,
    largeStep: 5,
    snap: { points: [0, 9.5, 24, 38.5, 52], threshold: 1.5 },
  }

  test("scrubTo lands on the nearest point within the threshold, or else on the step grid", () => {
    expect(scrubTo(23, timeline).value).toBe(24)
    expect(scrubTo(25.4, timeline).value).toBe(24)
    expect(scrubTo(25.6, timeline).value).toBe(25.6)
    expect(scrubTo(30.04, timeline).value).toBe(30)
    expect(scrubTo(23, timeline, { snap: false }).value).toBe(23)
    // Without the points it still lands on the grid; a step of 0 keeps the value exactly, within the bounds.
    expect(scrubTo(23.456, timeline, { snap: false }).value).toBe(23.5)
    expect(
      scrubTo(23.456, { ...timeline, step: 0 }, { snap: false }).value
    ).toBe(23.456)
    expect(scrubTo(70, { ...timeline, step: 0 }, { snap: false }).value).toBe(
      60
    )
    expect(
      scrubTo(23, { ...timeline, snap: { points: [22, 23.5], threshold: 2 } })
        .value
    ).toBe(23.5)
    expect(
      scrubTo(1, {
        min: 0,
        max: 10,
        step: 1,
        snap: { points: [-1], threshold: 3 },
      }).value
    ).toBe(0)
    expect(scrubTo(23, timeline)).toEqual({ value: 24, point: 24 })
    expect(scrubTo(30, timeline)).toEqual({ value: 30, point: undefined })
  })

  test("eases toward a point: unchanged at the threshold, faster as it closes in, and onto the point", () => {
    expect(scrubTo(22.5, timeline, { ease: true })).toEqual({
      value: 22.5,
      point: 24,
    })
    expect(scrubTo(23.25, timeline, { ease: true })).toEqual({
      value: 23.625,
      point: 24,
    })
    expect(scrubTo(24, timeline, { ease: true })).toEqual({
      value: 24,
      point: 24,
    })
    expect(scrubTo(23.25, timeline, { ease: (t) => t * t }).value).toBeCloseTo(
      23.4375
    )
    // Two points a threshold apart on each side meet without a jump.
    const collapse = {
      min: 0,
      max: 160,
      step: 1,
      snap: { points: [0, 160], threshold: 80 },
    }
    const shown = [79.9, 80, 80.1].map(
      (pointer) => scrubTo(pointer, collapse, { ease: true }).value
    )
    expect(shown[1]).toBe(80)
    expect(Math.abs(shown[2] - shown[0])).toBeLessThan(0.5)
    expect(
      scrubTo(
        5,
        { ...collapse, snap: { points: [0], threshold: 0 } },
        { ease: true }
      )
    ).toEqual({
      value: 5,
      point: undefined,
    })
  })

  test("a step stops at the first point it reaches ahead, and leaves the point it's on", () => {
    const right = { direction: 1, size: "step" } as const
    const left = { direction: -1, size: "step" } as const
    expect(stepBy(22.4, right, timeline)).toBe(24)
    expect(stepBy(22.3, right, timeline)).toBe(22.4)
    expect(stepBy(24, right, timeline)).toBe(24.1)
    expect(stepBy(24.1, left, timeline)).toBe(24)
    // A large step stops at the first point it passes.
    expect(stepBy(5, { direction: 1, size: "large" }, timeline)).toBe(9.5)
    expect(stepBy(24, { direction: 1, size: "large" }, timeline)).toBe(29)
    // Bounds don't snap, and `snap: false` steps past points.
    expect(stepBy(30, { bound: "max" }, timeline)).toBe(60)
    expect(stepBy(22.4, right, timeline, { snap: false })).toBe(22.5)
  })
})
