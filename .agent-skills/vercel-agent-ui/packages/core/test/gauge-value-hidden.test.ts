import { expect, test } from "vitest"
import { meter } from "../src/components/meter/meter"
import { progress } from "../src/components/progress/progress"
import { attrs } from "../src/foundation/kernel/part"

test("the visible value of a progress bar and a meter is hidden from screen readers", () => {
  for (const value of [0, 40, null]) {
    expect(attrs(progress({ id: "p", value }).part("value"))).toMatchObject({
      "aria-hidden": "true",
    })
  }
  expect(attrs(meter({ id: "m", value: 40 }).part("value"))).toMatchObject({
    "aria-hidden": "true",
  })
})
