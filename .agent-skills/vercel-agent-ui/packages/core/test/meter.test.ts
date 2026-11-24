import { describe, expect, test } from "vitest"
import { attrs, bind, partState } from "../src/foundation/kernel/part"
import { fakeElement } from "./selects"
import { meter } from "../src/components/meter/meter"

describe("meter parts", () => {
  test("a meter reads its range and value", () => {
    const instance = meter({ id: "m", value: 40 })
    expect(attrs(instance.part("root"))).toMatchObject({
      role: "meter",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": "40",
      "aria-valuetext": "40%",
      style: "--meter-value:40%",
    })
    expect(attrs(instance.part("indicator")).style).toBe(
      "inset-inline-start:0;width:40%"
    )
  })

  test("a meter has no status attributes, at any value", () => {
    for (const value of [0, 40, 100]) {
      const instance = meter({ id: "m", value })
      for (const slot of [
        "root",
        "track",
        "indicator",
        "label",
        "value",
      ] as const) {
        const data = Object.keys(attrs(instance.part(slot))).filter(
          (name) => name.startsWith("data-") && name !== "data-slot"
        )
        expect(data, `${slot} at ${value}`).toEqual([])
      }
    }
  })

  test("parts receive the value and where it sits", () => {
    const instance = meter({ id: "m", value: 3, min: 1, max: 5 })
    expect(partState(instance.part("track"))).toEqual({ value: 3, percent: 50 })
    expect(partState(instance.part("value"))).toEqual({
      value: 3,
      percent: 50,
      text: "50%",
    })
  })

  test("a value outside the bounds reads as the nearest bound", () => {
    const above = meter({ id: "m", value: 140 })
    expect(attrs(above.part("root"))["aria-valuenow"]).toBe("100")
    expect(attrs(above.part("indicator")).style).toBe(
      "inset-inline-start:0;width:100%"
    )
    const below = meter({ id: "m", value: -5, min: 0, max: 10 })
    expect(attrs(below.part("root"))["aria-valuenow"]).toBe("0")
    expect(partState(below.part("root")).percent).toBe(0)
  })

  test("a value that isn't a number reads as the minimum", () => {
    const instance = meter({ id: "m", value: Number.NaN, min: 10, max: 20 })
    expect(attrs(instance.part("root"))["aria-valuenow"]).toBe("10")
    expect(partState(instance.part("root")).value).toBe(10)
  })

  test("a unit format reads the value itself", () => {
    const instance = meter({
      id: "m",
      value: 128,
      max: 512,
      format: { style: "unit", unit: "gigabyte" },
      locale: "en-US",
    })
    expect(attrs(instance.part("root"))["aria-valuetext"]).toBe("128 GB")
    expect(partState(instance.part("value")).text).toBe("128 GB")
  })

  test("a value label receives a value and a percent that are never null", () => {
    const received: unknown[] = []
    const instance = meter({
      id: "m",
      value: 750,
      max: 1000,
      getValueLabel: (value, details) => {
        received.push(value, details.percent)
        return `${value} of ${details.max} requests (${details.formatted})`
      },
    })
    expect(attrs(instance.part("root"))["aria-valuetext"]).toBe(
      "750 of 1000 requests (75%)"
    )
    expect(received).toEqual([750, 75])
  })

  test("a new value updates every part", () => {
    const instance = meter({ id: "m", value: 20 })
    instance.setOptions({ id: "m", value: 65 })
    expect(attrs(instance.part("root"))).toMatchObject({
      "aria-valuenow": "65",
      style: "--meter-value:65%",
    })
    expect(partState(instance.part("value")).text).toBe("65%")
  })
})

describe("meter labels", () => {
  test("the meter stays named while any of its labels is on the page", async () => {
    const instance = meter({ id: "m", value: 40 })
    bind(instance.part("root"), fakeElement(0, "DIV"))
    await Promise.resolve()
    const first = instance.api.internal.label()
    const second = instance.api.internal.label()
    expect(attrs(instance.part("label")).id).toBe("m-label")
    expect(attrs(instance.part("root"))["aria-labelledby"]).toBe("m-label")
    first()
    first()
    expect(attrs(instance.part("root"))["aria-labelledby"]).toBe("m-label")
    second()
    expect(attrs(instance.part("root"))["aria-labelledby"]).toBeUndefined()
  })
})
