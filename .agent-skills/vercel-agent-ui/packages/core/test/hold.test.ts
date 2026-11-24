// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { bindHold, type BindHoldOptions } from "../src/index"

let cleanup: (() => void) | undefined
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup?.()
  vi.useRealTimers()
  document.body.replaceChildren()
})

const pointer = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
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

function setup(options: BindHoldOptions = {}) {
  const el = document.createElement("button")
  document.body.append(el)
  const onHold = vi.fn(options.onHold)
  const onEnd = vi.fn(options.onEnd)
  const onClick = vi.fn()
  el.addEventListener("click", onClick)
  cleanup = bindHold(el, { ...options, onHold, onEnd })
  return { el, onHold, onEnd, onClick }
}

describe("bindHold", () => {
  test("holds once a press lasts past its delay", () => {
    const { el, onHold, onEnd } = setup({ delay: 300 })
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(299)
    expect(onHold).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onHold).toHaveBeenCalledWith(
      expect.objectContaining({ input: "touch", count: 1 })
    )
    document.dispatchEvent(pointer("pointerup"))
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ held: true, canceled: false })
    )
  })

  test("a short press isn't held, and its click goes through", () => {
    const { el, onHold, onEnd, onClick } = setup()
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(100)
    document.dispatchEvent(pointer("pointerup"))
    el.click()
    expect(onHold).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ held: false, canceled: false })
    )
    expect(onClick).toHaveBeenCalledOnce()
  })

  test("a held press doesn't click what it's released on", () => {
    const { el, onClick } = setup()
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(500)
    el.dispatchEvent(pointer("pointerup"))
    el.click()
    expect(onClick).not.toHaveBeenCalled()
  })

  test("repeats while held, and stops repeating when onHold returns false", () => {
    const { el, onHold } = setup({
      delay: 400,
      repeat: 50,
      onHold: ({ count }) => count < 3,
    })
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(400 + 50 * 5)
    expect(onHold).toHaveBeenCalledTimes(3)
  })

  test("a pointer that moves past the tolerance before it's held cancels the press", () => {
    const { el, onHold, onEnd } = setup()
    el.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0 }))
    document.dispatchEvent(pointer("pointermove", { clientX: 0, clientY: 11 }))
    vi.advanceTimersByTime(500)
    expect(onHold).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ held: false, canceled: true })
    )
  })

  test("a held press keeps going as its pointer moves", () => {
    const { el, onEnd } = setup()
    el.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0 }))
    vi.advanceTimersByTime(500)
    document.dispatchEvent(pointer("pointermove", { clientX: 80, clientY: 0 }))
    expect(onEnd).not.toHaveBeenCalled()
  })

  test("a finger that starts to scroll cancels the press", () => {
    const { el, onHold, onEnd } = setup()
    el.dispatchEvent(pointer("pointerdown"))
    document.dispatchEvent(pointer("pointercancel"))
    vi.advanceTimersByTime(500)
    expect(onHold).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ canceled: true })
    )
  })

  test("Escape cancels the press without reaching anything around it", () => {
    const { el, onEnd } = setup()
    const outside = vi.fn()
    document.addEventListener("keydown", outside)
    el.dispatchEvent(pointer("pointerdown"))
    document.body.dispatchEvent(key("keydown", { key: "Escape" }))
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ canceled: true })
    )
    expect(outside).not.toHaveBeenCalled()
    document.removeEventListener("keydown", outside)
  })

  test("a press canceled with Escape doesn't click when it's released, held or not", () => {
    const { el, onClick } = setup()
    for (const wait of [100, 500]) {
      el.dispatchEvent(pointer("pointerdown"))
      vi.advanceTimersByTime(wait)
      document.body.dispatchEvent(key("keydown", { key: "Escape" }))
      el.dispatchEvent(pointer("pointerup"))
      el.dispatchEvent(
        new PointerEvent("click", {
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        })
      )
      vi.runAllTimers()
    }
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a press that moved past the tolerance doesn't click when it's released", () => {
    const { el, onClick } = setup()
    el.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0 }))
    document.dispatchEvent(pointer("pointermove", { clientX: 30, clientY: 0 }))
    el.dispatchEvent(pointer("pointerup"))
    el.dispatchEvent(
      new PointerEvent("click", {
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      })
    )
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a pointer press is canceled when the element loses focus", () => {
    const { el, onHold, onEnd } = setup()
    el.focus()
    el.dispatchEvent(pointer("pointerdown"))
    el.blur()
    vi.advanceTimersByTime(500)
    expect(onHold).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ canceled: true })
    )
  })

  test("a key press is canceled when the window loses focus", () => {
    const { el, onHold, onEnd } = setup()
    el.focus()
    el.dispatchEvent(key("keydown"))
    window.dispatchEvent(new FocusEvent("blur"))
    vi.advanceTimersByTime(500)
    expect(onHold).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ input: "keyboard", canceled: true })
    )
  })

  test("a Space press canceled with Escape keeps its keyup from clicking", () => {
    const { el, onClick } = setup()
    el.focus()
    el.dispatchEvent(key("keydown"))
    el.dispatchEvent(key("keydown", { key: "Escape" }))
    const up = key("keyup")
    el.dispatchEvent(up)
    expect(up.defaultPrevented).toBe(true)
    expect(onClick).not.toHaveBeenCalled()
  })

  test("an Enter press canceled with Escape keeps the key's repeats from clicking", () => {
    const { el, onClick } = setup()
    el.focus()
    el.dispatchEvent(key("keydown", { key: "Enter" }))
    el.dispatchEvent(key("keydown", { key: "Escape" }))
    const repeat = key("keydown", { key: "Enter", repeat: true })
    el.dispatchEvent(repeat)
    expect(repeat.defaultPrevented).toBe(true)
    el.dispatchEvent(key("keyup", { key: "Enter" }))
    expect(onClick).not.toHaveBeenCalled()
    el.dispatchEvent(key("keydown", { key: "Enter" }))
    el.dispatchEvent(key("keyup", { key: "Enter" }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  test("an onHold that unbinds or moves focus mid-repeat stops the repeats", () => {
    const { el, onHold } = setup({
      repeat: 50,
      onHold: ({ count }) => {
        if (count === 2) {
          el.blur()
        }
      },
    })
    el.focus()
    el.dispatchEvent(key("keydown"))
    expect(() => vi.advanceTimersByTime(500 + 50 * 4)).not.toThrow()
    expect(onHold).toHaveBeenCalledTimes(2)
    const unbinding = setup({ repeat: 50, onHold: () => cleanup?.() })
    unbinding.el.dispatchEvent(pointer("pointerdown"))
    expect(() => vi.advanceTimersByTime(500 + 50 * 4)).not.toThrow()
    expect(unbinding.onHold).toHaveBeenCalledOnce()
  })

  test("a keydown another handler prevented doesn't start a press", () => {
    const { el, onHold } = setup()
    el.addEventListener("keydown", (event) => event.preventDefault(), {
      capture: true,
    })
    el.dispatchEvent(key("keydown"))
    vi.advanceTimersByTime(500)
    expect(onHold).not.toHaveBeenCalled()
    expect(el.hasAttribute("data-holding")).toBe(false)
  })

  test("ignores a press onPress turns down", () => {
    const { el, onHold } = setup({ onPress: ({ input }) => input === "touch" })
    el.dispatchEvent(pointer("pointerdown", { pointerType: "mouse" }))
    vi.advanceTimersByTime(500)
    expect(onHold).not.toHaveBeenCalled()
    expect(el.hasAttribute("data-holding")).toBe(false)
  })

  test("ignores another mouse button and a second finger", () => {
    const { el, onHold } = setup()
    el.dispatchEvent(
      pointer("pointerdown", { pointerType: "mouse", button: 2 })
    )
    el.dispatchEvent(pointer("pointerdown", { pointerId: 2, isPrimary: false }))
    vi.advanceTimersByTime(500)
    expect(onHold).not.toHaveBeenCalled()
  })

  test("a mouse released outside the window ends the press", () => {
    const { el, onEnd } = setup()
    el.dispatchEvent(pointer("pointerdown", { pointerType: "mouse" }))
    document.dispatchEvent(
      pointer("pointermove", { pointerType: "mouse", buttons: 0 })
    )
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ canceled: false })
    )
  })

  test("Space held holds, and its release doesn't click", () => {
    const { el, onHold, onEnd, onClick } = setup()
    el.focus()
    el.dispatchEvent(key("keydown"))
    vi.advanceTimersByTime(500)
    el.dispatchEvent(key("keyup"))
    expect(onHold).toHaveBeenCalledWith(
      expect.objectContaining({ input: "keyboard" })
    )
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ input: "keyboard", held: true })
    )
    expect(onClick).not.toHaveBeenCalled()
  })

  test("a short press of Enter clicks once, however often the key repeats", () => {
    const { el, onClick } = setup()
    el.focus()
    el.dispatchEvent(key("keydown", { key: "Enter" }))
    el.dispatchEvent(key("keydown", { key: "Enter", repeat: true }))
    el.dispatchEvent(key("keyup", { key: "Enter" }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  test("leaves keys alone when keys is empty", () => {
    const { el, onHold } = setup({ keys: [] })
    const down = key("keydown")
    el.dispatchEvent(down)
    vi.advanceTimersByTime(500)
    expect(down.defaultPrevented).toBe(false)
    expect(onHold).not.toHaveBeenCalled()
  })

  test("a disabled element can't be pressed, and stops repeating once disabled", () => {
    let disabled = true
    const { el, onHold } = setup({ repeat: 50, disabled: () => disabled })
    el.dispatchEvent(pointer("pointerdown"))
    expect(el.hasAttribute("data-holding")).toBe(false)
    disabled = false
    el.dispatchEvent(pointer("pointerdown"))
    vi.advanceTimersByTime(550)
    disabled = true
    vi.advanceTimersByTime(500)
    expect(onHold).toHaveBeenCalledTimes(2)
  })

  test("marks the press and the hold for CSS, with the delay as a variable", () => {
    const { el } = setup({ delay: 800 })
    expect(el.style.getPropertyValue("--hold-delay")).toBe("800ms")
    el.dispatchEvent(pointer("pointerdown"))
    expect(el.hasAttribute("data-holding")).toBe(true)
    expect(el.hasAttribute("data-held")).toBe(false)
    vi.advanceTimersByTime(800)
    expect(el.hasAttribute("data-held")).toBe(true)
    document.dispatchEvent(pointer("pointerup"))
    expect(el.hasAttribute("data-holding")).toBe(false)
    expect(el.hasAttribute("data-held")).toBe(false)
  })

  test("keeps a long press from opening the browser's context menu", () => {
    const { el } = setup()
    el.dispatchEvent(pointer("pointerdown"))
    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
  })

  test("cleanup stops a press under way without calling onEnd", () => {
    const { el, onHold, onEnd } = setup()
    el.dispatchEvent(pointer("pointerdown"))
    cleanup?.()
    cleanup = undefined
    vi.advanceTimersByTime(500)
    document.dispatchEvent(pointer("pointerup"))
    expect(onHold).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(el.hasAttribute("data-holding")).toBe(false)
    expect(el.style.getPropertyValue("--hold-delay")).toBe("")
  })
})
