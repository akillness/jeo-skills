// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { bindRepeat, type BindRepeatOptions } from "../src/index"

let cleanup: (() => void) | undefined
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.useRealTimers()
  document.body.replaceChildren()
})

const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, {
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: 10,
    clientY: 10,
    bubbles: true,
    cancelable: true,
    ...init,
  })

const key = (type: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent(type, {
    key: " ",
    bubbles: true,
    cancelable: true,
    ...init,
  })

const click = (detail: number) =>
  new MouseEvent("click", { detail, bubbles: true, cancelable: true })

function setup(options: BindRepeatOptions = {}) {
  const el = document.createElement("button")
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 100, bottom: 40 }) as DOMRect
  document.body.append(el)
  const onStep = vi.fn(options.onStep)
  const onEnd = vi.fn(options.onEnd)
  cleanup = bindRepeat(el, { ...options, onStep, onEnd })
  return { el, onStep, onEnd }
}

describe("bindRepeat", () => {
  test("a mouse press steps at once, then repeats after the delay at the interval", () => {
    const { el, onStep } = setup({ delay: 300, repeat: 50 })
    el.dispatchEvent(pointer("pointerdown"))
    expect(onStep).toHaveBeenCalledOnce()
    expect(onStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ input: "mouse", count: 1 })
    )
    vi.advanceTimersByTime(299)
    expect(onStep).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    expect(onStep).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(100)
    expect(onStep).toHaveBeenCalledTimes(4)
    expect(onStep).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 4 })
    )
  })

  test("waits 400 milliseconds, then steps every 60 by default", () => {
    const { el, onStep } = setup()
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(399)
    expect(onStep).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1 + 60 * 2)
    expect(onStep).toHaveBeenCalledTimes(4)
  })

  test("releasing stops the repeats and reports how many steps ran", () => {
    const { el, onStep, onEnd } = setup({ delay: 300, repeat: 50 })
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(350)
    document.dispatchEvent(pointer("pointerup"))
    vi.advanceTimersByTime(1000)
    expect(onStep).toHaveBeenCalledTimes(3)
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ input: "mouse", count: 3 })
    )
  })

  test("a pointer cancel or focus leaving stops the repeats", () => {
    const { el, onStep } = setup({ delay: 300, repeat: 50 })
    el.focus()
    el.dispatchEvent(pointer("pointerdown"))
    document.dispatchEvent(pointer("pointercancel"))
    el.dispatchEvent(pointer("pointerdown"))
    el.blur()
    vi.advanceTimersByTime(1000)
    expect(onStep).toHaveBeenCalledTimes(2)
  })

  test("repeats wait while the pointer is off the element, and go on when it's back", () => {
    const { el, onStep } = setup({ delay: 300, repeat: 50 })
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(300)
    expect(onStep).toHaveBeenCalledTimes(2)
    document.dispatchEvent(pointer("pointermove", { clientX: 200 }))
    vi.advanceTimersByTime(500)
    expect(onStep).toHaveBeenCalledTimes(2)
    document.dispatchEvent(pointer("pointermove", { clientX: 50 }))
    vi.advanceTimersByTime(50)
    expect(onStep).toHaveBeenCalledTimes(3)
  })

  test("the click after a pointer press doesn't step again", () => {
    const { el, onStep } = setup()
    el.dispatchEvent(pointer("pointerdown"))
    document.dispatchEvent(pointer("pointerup"))
    el.dispatchEvent(click(1))
    expect(onStep).toHaveBeenCalledOnce()
  })

  test("a click with no press behind it steps once and ends", () => {
    const { el, onStep, onEnd } = setup()
    el.dispatchEvent(click(0))
    expect(onStep).toHaveBeenCalledWith(
      expect.objectContaining({ input: "click", count: 1 })
    )
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ input: "click", count: 1 })
    )
    vi.advanceTimersByTime(1000)
    expect(onStep).toHaveBeenCalledOnce()
  })

  test("a click another listener prevented doesn't step", () => {
    const { el, onStep } = setup()
    el.addEventListener("click", (event) => event.preventDefault(), {
      capture: true,
    })
    el.dispatchEvent(click(0))
    expect(onStep).not.toHaveBeenCalled()
  })

  test("a tap steps once on release, and a finger that scrolls never steps", () => {
    const { el, onStep } = setup()
    el.dispatchEvent(pointer("pointerdown", { pointerType: "touch" }))
    expect(onStep).not.toHaveBeenCalled()
    document.dispatchEvent(pointer("pointerup", { pointerType: "touch" }))
    el.dispatchEvent(click(1))
    expect(onStep).toHaveBeenCalledWith(
      expect.objectContaining({ input: "touch", count: 1 })
    )
    el.dispatchEvent(pointer("pointerdown", { pointerType: "touch" }))
    document.dispatchEvent(pointer("pointercancel", { pointerType: "touch" }))
    expect(onStep).toHaveBeenCalledOnce()
  })

  test("a held finger steps once held, then repeats, and its release doesn't step again", () => {
    const { el, onStep } = setup({ delay: 300, repeat: 50 })
    el.dispatchEvent(pointer("pointerdown", { pointerType: "touch" }))
    vi.advanceTimersByTime(350)
    document.dispatchEvent(pointer("pointerup", { pointerType: "touch" }))
    expect(onStep).toHaveBeenCalledTimes(2)
  })

  test("a tap released off the element doesn't step", () => {
    const { el, onStep } = setup()
    el.dispatchEvent(pointer("pointerdown", { pointerType: "pen" }))
    document.dispatchEvent(
      pointer("pointermove", { pointerType: "pen", clientX: 300 })
    )
    document.dispatchEvent(
      pointer("pointerup", { pointerType: "pen", clientX: 300 })
    )
    expect(onStep).not.toHaveBeenCalled()
  })

  test("a key press steps once on keydown, however often the key repeats", () => {
    const { el, onStep } = setup()
    el.focus()
    el.dispatchEvent(key("keydown", { key: "Enter" }))
    el.dispatchEvent(key("keydown", { key: "Enter", repeat: true }))
    el.dispatchEvent(key("keyup", { key: "Enter" }))
    expect(onStep).toHaveBeenCalledOnce()
    expect(onStep).toHaveBeenCalledWith(
      expect.objectContaining({ input: "keyboard" })
    )
  })

  test("a held key repeats like a pointer, and stops on keyup", () => {
    const { el, onStep } = setup({ delay: 300, repeat: 50 })
    el.focus()
    el.dispatchEvent(key("keydown"))
    vi.advanceTimersByTime(400)
    el.dispatchEvent(key("keyup"))
    vi.advanceTimersByTime(1000)
    expect(onStep).toHaveBeenCalledTimes(4)
  })

  test("with keys empty, the browser's click steps once per key press", () => {
    const { el, onStep } = setup({ keys: [] })
    el.focus()
    const down = key("keydown", { key: "Enter" })
    el.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    el.dispatchEvent(click(0))
    expect(onStep).toHaveBeenCalledOnce()
  })

  test("stops repeating when onStep returns false", () => {
    const { el, onStep } = setup({
      delay: 300,
      repeat: 50,
      onStep: ({ count }) => count < 3,
    })
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(1000)
    expect(onStep).toHaveBeenCalledTimes(3)
  })

  test("a press onPress turns down doesn't step, and neither does its click", () => {
    const { el, onStep } = setup({ onPress: () => false })
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(1000)
    document.dispatchEvent(pointer("pointerup"))
    el.dispatchEvent(click(1))
    expect(onStep).not.toHaveBeenCalled()
  })

  test("a first step that moves focus ends the press, for a pointer and a key", async () => {
    const other = document.createElement("button")
    document.body.append(other)
    const { el, onStep, onEnd } = setup({
      onStep: ({ count }) => {
        if (count === 1) {
          other.focus()
        }
      },
    })
    el.focus()
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(1000)
    document.dispatchEvent(pointer("pointerup"))
    expect(onStep).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledOnce()
    el.focus()
    el.dispatchEvent(key("keydown", { key: "Enter" }))
    el.dispatchEvent(click(0))
    vi.advanceTimersByTime(1000)
    expect(onStep).toHaveBeenCalledTimes(2)
    expect(onEnd).toHaveBeenCalledTimes(2)
    expect(el.hasAttribute("data-holding")).toBe(false)
    other.dispatchEvent(key("keyup", { key: "Enter" }))
    vi.runAllTimers()
    await Promise.resolve()
    el.dispatchEvent(click(0))
    expect(onStep).toHaveBeenCalledTimes(3)
  })

  test("a first step that unbinds leaves no press behind, for a pointer and a key", () => {
    for (const press of [
      pointer("pointerdown"),
      key("keydown", { key: "Enter" }),
    ]) {
      const { el, onStep, onEnd } = setup({ onStep: () => cleanup?.() })
      el.focus()
      el.dispatchEvent(press)
      vi.advanceTimersByTime(1000)
      expect(onStep).toHaveBeenCalledOnce()
      expect(onEnd).not.toHaveBeenCalled()
      expect(el.hasAttribute("data-holding")).toBe(false)
      cleanup = undefined
    }
  })

  test("the click that follows a key press onPress turns down doesn't step, from Enter or Space", () => {
    const { el, onStep, onEnd } = setup({ onPress: () => false })
    el.focus()
    el.dispatchEvent(key("keydown", { key: "Enter" }))
    el.dispatchEvent(click(0))
    el.dispatchEvent(key("keyup", { key: "Enter" }))
    vi.runAllTimers()
    el.dispatchEvent(key("keydown"))
    el.dispatchEvent(key("keyup"))
    el.dispatchEvent(click(0))
    vi.runAllTimers()
    expect(onStep).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    el.dispatchEvent(click(0))
    expect(onStep).toHaveBeenCalledOnce()
  })

  test("a disabled element doesn't step from a press, a tap or a click", () => {
    const { el, onStep } = setup({ disabled: () => true })
    el.dispatchEvent(pointer("pointerdown"))
    el.dispatchEvent(pointer("pointerdown", { pointerType: "touch" }))
    document.dispatchEvent(pointer("pointerup", { pointerType: "touch" }))
    el.dispatchEvent(click(0))
    vi.advanceTimersByTime(1000)
    expect(onStep).not.toHaveBeenCalled()
  })

  test("cleanup stops a press under way and removes its listeners", () => {
    const { el, onStep, onEnd } = setup()
    el.dispatchEvent(pointer("pointerdown"))
    cleanup?.()
    cleanup = undefined
    vi.advanceTimersByTime(1000)
    document.dispatchEvent(pointer("pointerup"))
    el.dispatchEvent(click(0))
    expect(onStep).toHaveBeenCalledOnce()
    expect(onEnd).not.toHaveBeenCalled()
  })
})
