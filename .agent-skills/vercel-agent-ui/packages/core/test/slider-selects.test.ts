import { describe, expect, test } from "vitest"
import { slider } from "../src/components/slider/slider"
import { expectNoMissedUpdates, type Part } from "./selects"

// Thumbs select on their own value, and their range inputs on their own and
// their neighbours', so a move reaches the thumbs it changes, not every one.

describe("slider thumbs select on their own value and their neighbours'", () => {
  test("no part misses a change", async () => {
    const options = {
      id: "s",
      defaultValue: [10, 30, 50, 70],
      minStepsBetweenThumbs: 5,
    }
    const instance = slider(options)
    const { api } = instance
    const thumbs = [0, 1, 2, 3, 4].map((index) => ({
      index,
      id: String(index),
    }))
    const parts: Part[] = [
      { slot: "root", props: {} },
      { slot: "indicator", props: {} },
      { slot: "value", props: {} },
      ...thumbs.flatMap((props) => [
        { slot: "thumb", props },
        { slot: "thumb-input", props },
      ]),
    ]
    const key = (name: string) =>
      ({ key: name, shiftKey: false, preventDefault() {} }) as KeyboardEvent
    const heard = await expectNoMissedUpdates(instance, parts, [
      ["press the track", () => api.internal.begin(45, null)],
      ["drag", () => api.internal.move(48)],
      ["drag into the next thumb", () => api.internal.move(90)],
      ["end the drag", () => api.internal.end()],
      ["press a thumb", () => api.internal.begin(10, 0)],
      ["drag it", () => api.internal.move(15)],
      ["end that drag", () => api.internal.end()],
      [
        "an arrow key",
        () => api.internal.keydown(key("ArrowRight"), 3, {} as HTMLElement),
      ],
      ["End", () => api.internal.keydown(key("End"), 3, {} as HTMLElement)],
      ["the key comes up", () => api.internal.commitKeys()],
      [
        "a screen reader adjusts",
        () => api.internal.adjust(1, 25, new Event("input")),
      ],
      ["set the value", () => api.setValue([5, 40, 60, 95])],
      ["add a thumb", () => api.setValue([5, 40, 60, 80, 95])],
      ["remove two", () => api.setValue([5, 40, 60])],
      ["change the bounds", () => instance.setOptions({ ...options, max: 80 })],
      ["change the step", () => instance.setOptions({ ...options, step: 5 })],
      [
        "change the gap",
        () => instance.setOptions({ ...options, minStepsBetweenThumbs: 0 }),
      ],
      [
        "change the locale",
        () => instance.setOptions({ ...options, locale: "ar-EG" }),
      ],
      [
        "vertical",
        () => instance.setOptions({ ...options, orientation: "vertical" }),
      ],
      ["reset", () => api.internal.reset()],
      ["disable it", () => instance.setOptions({ ...options, disabled: true })],
    ])
    // The thumb and its input, its neighbours' inputs, and the root, the
    // indicator and the value, which hear every change.
    expect(heard["drag"]).toBe(7)
  })
})
