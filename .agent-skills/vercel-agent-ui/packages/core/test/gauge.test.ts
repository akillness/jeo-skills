import { describe, expect, test } from "vitest"
import {
  formatGaugeValue,
  gaugeSettings,
  percentBetween,
} from "../src/foundation/gauge/gauge"
import { progress } from "../src/components/progress/progress"
import { attrs, bind, partState } from "../src/foundation/kernel/part"
import { fakeElement } from "./selects"

describe("gauge values", () => {
  test("places a value between the bounds, clamped", () => {
    expect(percentBetween(30, 0, 60)).toBe(50)
    expect(percentBetween(-5, 0, 100)).toBe(0)
    expect(percentBetween(150, 0, 100)).toBe(100)
    expect(percentBetween(5, 5, 5)).toBe(100)
  })

  test("treats a maximum below the minimum as the minimum", () => {
    expect(gaugeSettings({ min: 10, max: 5 })).toMatchObject({
      min: 10,
      max: 10,
    })
  })

  test("formats the share of the range as a percent by default", () => {
    expect(formatGaugeValue(30, gaugeSettings({ max: 60 }))).toBe("50%")
    expect(formatGaugeValue(null, gaugeSettings({}))).toBe("")
  })

  test("formats the value itself in any other style", () => {
    const settings = gaugeSettings({
      max: 512,
      format: { style: "unit", unit: "gigabyte" },
      locale: "en-US",
    })
    expect(formatGaugeValue(128, settings)).toBe("128 GB")
  })

  test("formats in the locale it's given", () => {
    expect(
      formatGaugeValue(0.5, gaugeSettings({ max: 1, locale: "de-DE" }))
    ).toMatch(/^50\s%$/)
  })

  test("formats with a function", () => {
    expect(
      formatGaugeValue(
        3,
        gaugeSettings({ max: 12, format: (value) => `${value} of 12` })
      )
    ).toBe("3 of 12")
  })
})

describe("progress parts", () => {
  test("a progress bar reads its range and value", () => {
    const bar = progress({ id: "p", value: 40 })
    expect(attrs(bar.part("root"))).toMatchObject({
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": "40",
      "aria-valuetext": "40%",
      "data-progressing": "",
    })
    expect(attrs(bar.part("indicator")).style).toBe(
      "inset-inline-start:0;width:40%"
    )
  })

  test("an indeterminate progress bar has no value", () => {
    const bar = progress({ id: "p", value: null })
    expect(attrs(bar.part("root"))["aria-valuenow"]).toBeUndefined()
    expect(attrs(bar.part("root"))["aria-valuetext"]).toBeUndefined()
    expect(attrs(bar.part("root"))["data-indeterminate"]).toBe("")
    expect(attrs(bar.part("indicator")).style).toBeUndefined()
    expect(partState(bar.part("root")).status).toBe("indeterminate")
  })

  test("a progress bar at its maximum is complete", () => {
    const bar = progress({ id: "p", value: 100 })
    expect(attrs(bar.part("track"))).toMatchObject({ "data-complete": "" })
    expect(partState(bar.part("root")).status).toBe("complete")
  })

  test("a value label replaces the formatted value for screen readers", () => {
    const bar = progress({
      id: "p",
      value: 3,
      max: 12,
      getValueLabel: (value, { formatted }) =>
        `${value} of 12 files (${formatted})`,
    })
    expect(attrs(bar.part("root"))["aria-valuetext"]).toBe(
      "3 of 12 files (25%)"
    )
  })
})

describe("progress labels", () => {
  test("the bar stays named while any of its labels is on the page", async () => {
    const instance = progress({ id: "p", value: 40 })
    bind(instance.part("root"), fakeElement(0, "DIV"))
    await Promise.resolve()
    const first = instance.api.internal.label()
    const second = instance.api.internal.label()
    expect(attrs(instance.part("root"))["aria-labelledby"]).toBe("p-label")
    first()
    first()
    expect(attrs(instance.part("root"))["aria-labelledby"]).toBe("p-label")
    second()
    expect(attrs(instance.part("root"))["aria-labelledby"]).toBeUndefined()
  })
})
