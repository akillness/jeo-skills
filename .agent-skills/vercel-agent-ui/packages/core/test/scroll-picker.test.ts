// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest"
import {
  bindScrollPicker,
  nearestEnabled,
  pickerPosition,
} from "../src/foundation/lists/scroll-picker"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("pickerPosition", () => {
  const centers = [20, 60, 100, 140]

  test("is the index of the option whose center it is", () => {
    expect(pickerPosition(centers, 20)).toBe(0)
    expect(pickerPosition(centers, 100)).toBe(2)
    expect(pickerPosition(centers, 140)).toBe(3)
  })

  test("is fractional between two centers", () => {
    expect(pickerPosition(centers, 80)).toBe(1.5)
    expect(pickerPosition(centers, 70)).toBe(1.25)
  })

  test("carries on at the spacing of the last two past either end", () => {
    expect(pickerPosition(centers, 0)).toBe(-0.5)
    expect(pickerPosition(centers, 160)).toBe(3.5)
  })

  test("follows options of different sizes", () => {
    expect(pickerPosition([10, 40, 120], 80)).toBe(1.5)
  })

  test("is 0 with fewer than two options", () => {
    expect(pickerPosition([], 50)).toBe(0)
    expect(pickerPosition([25], 50)).toBe(0)
  })
})

describe("nearestEnabled", () => {
  const none = () => false

  test("rounds to the nearest option", () => {
    expect(nearestEnabled(1.4, 5, none)).toBe(1)
    expect(nearestEnabled(1.6, 5, none)).toBe(2)
  })

  test("stays within the options", () => {
    expect(nearestEnabled(-0.8, 5, none)).toBe(0)
    expect(nearestEnabled(7, 5, none)).toBe(4)
  })

  test("skips a disabled option for the closer neighbor", () => {
    const disabled = (index: number) => index === 2
    expect(nearestEnabled(2.2, 5, disabled)).toBe(3)
    expect(nearestEnabled(1.8, 5, disabled)).toBe(1)
  })

  test("skips several disabled options", () => {
    const disabled = (index: number) => index >= 2
    expect(nearestEnabled(4, 5, disabled)).toBe(1)
  })

  test("is -1 when every option is disabled", () => {
    expect(nearestEnabled(1, 3, () => true)).toBe(-1)
  })
})

describe("bindScrollPicker", () => {
  function render() {
    document.body.innerHTML = `
      <div role="listbox" aria-label="Hour">
        <div role="option" aria-selected="false">1</div>
        <div role="option" aria-selected="true">2</div>
        <div role="option" aria-selected="false">3</div>
      </div>`
    return document.querySelector<HTMLElement>('[role="listbox"]')!
  }

  test("writes each option's offset from the center, and removes it on cleanup", () => {
    const list = render()
    const unbind = bindScrollPicker(list)
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(
      options.every((option) =>
        option.style.getPropertyValue("--picker-offset")
      )
    ).toBe(true)
    unbind()
    expect(
      options.some((option) => option.style.getPropertyValue("--picker-offset"))
    ).toBe(false)
  })

  // Lays the list out as a browser would: 180px tall with 72px of padding,
  // 36px options, and every box scaled by the transform around it.
  function layOut(list: HTMLElement, scale = 1, height = 180) {
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')]
    const rect = (top: number, height: number) =>
      ({
        top: top * scale,
        height: height * scale,
        left: 0,
        width: 0,
      }) as DOMRect
    Object.defineProperties(list, {
      offsetHeight: { value: 180 },
      clientHeight: { value: 180 },
      scrollHeight: { value: 144 + options.length * 36 },
    })
    list.getBoundingClientRect = () => rect(0, height)
    list.scrollTo = (({ top }: ScrollToOptions) => {
      list.scrollTop = top!
    }) as typeof list.scrollTo
    options.forEach((option, index) => {
      option.getBoundingClientRect = () =>
        rect(72 + index * 36 - list.scrollTop, 36)
    })
  }

  test("centers the selected option under a transform that scales the list", () => {
    const list = render()
    layOut(list, 0.5)
    const unbind = bindScrollPicker(list)
    expect(list.scrollTop).toBe(36)
    unbind()
  })

  test("a list with a fractional height isn't taken for a scaled one", () => {
    const list = render()
    layOut(list, 1, 180.4)
    const unbind = bindScrollPicker(list)
    expect(list.scrollTop).toBe(36)
    unbind()
  })

  test("bound while hidden, a scroll as the list shows centers the selected option and selects nothing", () => {
    const list = render()
    const selected: number[] = []
    const unbind = bindScrollPicker(list, {
      onSelect: (index) => selected.push(index),
    })
    layOut(list)
    list.dispatchEvent(new Event("scroll"))
    expect(list.scrollTop).toBe(36)
    expect(selected).toEqual([])
    unbind()
  })

  test("a value set from outside moves focus from the old option to the new one", async () => {
    const list = render()
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')]
    options.forEach((option) => option.setAttribute("tabindex", "-1"))
    layOut(list)
    const unbind = bindScrollPicker(list)
    options[1].focus()
    options[1].setAttribute("aria-selected", "false")
    options[0].setAttribute("aria-selected", "true")
    await Promise.resolve()
    expect(document.activeElement).toBe(options[0])
    unbind()
  })

  test("a Page Down reports the option it moves to", () => {
    const list = render()
    const selected: number[] = []
    const unbind = bindScrollPicker(list, {
      onSelect: (index) => selected.push(index),
    })
    list.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "PageDown",
        bubbles: true,
        cancelable: true,
      })
    )
    expect(selected).toEqual([2])
    unbind()
  })
})
