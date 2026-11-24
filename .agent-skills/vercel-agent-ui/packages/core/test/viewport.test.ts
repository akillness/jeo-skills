// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  measureViewportEarly,
  trackKeyboard,
} from "../src/foundation/platform/keyboard"
import { bindAvoidKeyboard, bindViewport } from "../src/index"

type FakeViewport = EventTarget & {
  width: number
  height: number
  offsetTop: number
  offsetLeft: number
  scale: number
}

function phone(layoutHeight = 800) {
  const visual = Object.assign(new EventTarget(), {
    width: 400,
    height: layoutHeight,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
  }) as FakeViewport
  Object.defineProperty(window, "visualViewport", {
    value: visual,
    configurable: true,
  })
  Object.defineProperty(window, "innerHeight", {
    value: layoutHeight,
    configurable: true,
  })
  const move = (next: Partial<FakeViewport> & { layoutHeight?: number }) => {
    const { layoutHeight: layout, ...rest } = next
    if (layout !== undefined) {
      Object.defineProperty(window, "innerHeight", {
        value: layout,
        configurable: true,
      })
    }
    Object.assign(visual, rest)
    visual.dispatchEvent(new Event("resize"))
  }
  return { visual, move }
}

// The keyboard opens for a focused field.
function type() {
  const field = document.createElement("input")
  document.body.append(field)
  field.focus()
  return field
}

function box(el: HTMLElement, top: number, bottom: number) {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left: 0,
      right: 400,
      width: 400,
      height: bottom - top,
    }) as DOMRect
}

// Focus moving between buttons, which open no keyboard.
function tabThroughButtons(count: number) {
  const buttons = Array.from({ length: count }, () =>
    document.createElement("button")
  )
  document.body.append(...buttons)
  for (const button of buttons) {
    button.focus()
  }
}

// Each measurement of the visual viewport reads its height once.
function countHeightReads(visual: FakeViewport) {
  let height = visual.height
  const reads = { count: 0 }
  Object.defineProperty(visual, "height", {
    get: () => {
      reads.count++
      return height
    },
    set: (value: number) => {
      height = value
    },
  })
  return reads
}

// What a test started and didn't stop, so nothing listens into the next one.
const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe("bindViewport", () => {
  test("writes the keyboard and the visual viewport, and reports each change once", () => {
    const { move } = phone()
    const root = document.createElement("div")
    const onChange = vi.fn()
    const stop = bindViewport(root, { onChange })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toMatchObject({
      keyboard: 0,
      keyboardInset: 0,
      width: 400,
      height: 800,
      scale: 1,
    })
    expect(root.hasAttribute("data-keyboard")).toBe(false)
    // A field takes focus and the keyboard takes 400 pixels; iOS pans 100 to keep the field in view, so 300 of the layout are covered.
    const field = type()
    move({ height: 400, offsetTop: 100 })
    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      keyboard: 400,
      keyboardInset: 300,
      height: 400,
      offsetTop: 100,
    })
    expect(root.style.getPropertyValue("--keyboard-inset")).toBe("300px")
    expect(root.style.getPropertyValue("--visual-viewport-height")).toBe(
      "400px"
    )
    expect(root.style.getPropertyValue("--visual-viewport-top")).toBe("100px")
    expect(root.hasAttribute("data-keyboard")).toBe(true)
    const calls = onChange.mock.calls.length
    move({ height: 400, offsetTop: 100 })
    expect(onChange).toHaveBeenCalledTimes(calls)
    // Without a focused field, a smaller visual viewport is pinch zoom, not a keyboard.
    field.blur()
    move({ height: 400, offsetTop: 0, scale: 2 })
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ keyboard: 0, scale: 2 })
    stop()
    expect(root.style.getPropertyValue("--keyboard-inset")).toBe("")
    expect(root.hasAttribute("data-keyboard")).toBe(false)
    expect(document.body.querySelector("[aria-hidden]")).toBe(null)
  })

  test("finds the keyboard when iOS zooms into a small field, or shrinks the layout viewport with it", () => {
    const { move } = phone()
    const onChange = vi.fn()
    cleanups.push(bindViewport(document.createElement("div"), { onChange }))
    const field = type()
    // Zoomed to 115%: 300 points of keyboard leave 500 on screen, so it takes 261 of the page's pixels.
    move({ width: 400 / 1.15, height: 500 / 1.15, scale: 1.15 })
    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      keyboard: 261,
      keyboardInset: 261,
    })
    field.blur()
    move({ width: 400, height: 800, scale: 1 })
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ keyboard: 0 })
    // The layout viewport shrinks along with the keyboard, so nothing of it is covered.
    type()
    move({ height: 500, layoutHeight: 500 })
    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      keyboard: 300,
      keyboardInset: 0,
    })
  })

  test("keeps the keyboard while focus goes from one field to the next, and measures again once it closes", () => {
    const { move } = phone()
    const root = document.createElement("div")
    const onChange = vi.fn()
    cleanups.push(bindViewport(root, { onChange }))
    type()
    move({ height: 500 })
    expect(onChange.mock.lastCall?.[0].keyboard).toBe(300)
    // The next field takes focus with the keyboard still open.
    const next = type()
    expect(onChange.mock.lastCall?.[0].keyboard).toBe(300)
    expect(root.hasAttribute("data-keyboard")).toBe(true)
    // Focus leaves before the keyboard closes; the page measured once it has is the one without a keyboard.
    next.blur()
    expect(onChange.mock.lastCall?.[0].keyboard).toBe(0)
    move({ height: 800 })
    type()
    move({ height: 450 })
    expect(onChange.mock.lastCall?.[0].keyboard).toBe(350)
  })

  test("keeps the keyboard for everything following it when another binding mounts between two fields", () => {
    const { move } = phone()
    const root = document.createElement("div")
    const onChange = vi.fn()
    cleanups.push(bindViewport(root, { onChange }))
    const field = type()
    move({ height: 500 })
    expect(onChange.mock.lastCall?.[0].keyboard).toBe(300)
    // The field blurs, and before the keyboard closes another binding mounts.
    field.blur()
    const later = vi.fn()
    cleanups.push(
      bindViewport(document.createElement("div"), { onChange: later })
    )
    type()
    expect(onChange.mock.lastCall?.[0].keyboard).toBe(300)
    expect(later.mock.lastCall?.[0].keyboard).toBe(300)
    const bar = document.createElement("div")
    box(bar, 740, 800)
    cleanups.push(bindAvoidKeyboard(bar))
    expect(bar.hasAttribute("data-keyboard")).toBe(true)
  })

  test("reports the inset at Safari's page zoom without a focused field, and sees fields inside shadow roots", () => {
    const { visual, move } = phone()
    Object.assign(visual, { scale: 1.15 })
    const root = document.createElement("div")
    const onChange = vi.fn()
    cleanups.push(bindViewport(root, { onChange }))
    // The page's own zoom: the visual viewport fills the layout viewport at 115%.
    move({ height: 500 })
    expect(root.style.getPropertyValue("--keyboard-inset")).toBe("300px")
    expect(onChange.mock.lastCall?.[0].keyboard).toBe(0)
    move({ height: 800 })
    const host = document.createElement("div")
    document.body.append(host)
    const field = document.createElement("input")
    host.attachShadow({ mode: "open" }).append(field)
    field.focus()
    move({ height: 500 })
    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      keyboard: 300,
      keyboardInset: 300,
    })
  })

  test("reads the safe areas from env() through a hidden element", () => {
    phone()
    const real = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const style = real(el)
      // jsdom drops env() from the probe's style, so it's found by what it is.
      if (
        el.getAttribute("aria-hidden") !== "true" ||
        (el as HTMLElement).style.position !== "fixed"
      ) {
        return style
      }
      const insets: Record<string, string> = {
        "padding-top": "47px",
        "padding-bottom": "34px",
      }
      return {
        getPropertyValue: (name: string) => insets[name] ?? "0px",
      } as CSSStyleDeclaration
    })
    const onChange = vi.fn()
    cleanups.push(bindViewport(document.createElement("div"), { onChange }))
    expect(onChange.mock.calls[0][0].safeArea).toEqual({
      top: 47,
      right: 0,
      bottom: 34,
      left: 0,
    })
  })

  test("reads the safe areas again on a resize, not on a focus change", () => {
    const { move } = phone()
    const styles = vi.spyOn(window, "getComputedStyle")
    cleanups.push(bindViewport(document.createElement("div")))
    expect(styles).toHaveBeenCalledTimes(1)
    tabThroughButtons(20)
    expect(styles).toHaveBeenCalledTimes(1)
    move({ width: 800, height: 400, layoutHeight: 400 })
    expect(styles).toHaveBeenCalledTimes(2)
  })

  test("writes nothing on a focus change that changes nothing", () => {
    phone()
    const root = document.createElement("div")
    const onChange = vi.fn()
    cleanups.push(bindViewport(root, { onChange }))
    const writes = vi.spyOn(root.style, "setProperty")
    tabThroughButtons(20)
    expect(writes).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(root.style.getPropertyValue("--visual-viewport-height")).toBe(
      "800px"
    )
  })
})

describe("bindAvoidKeyboard", () => {
  test("lifts a bar at the bottom by the whole keyboard, and an inline composer only by what's covered", () => {
    const { move } = phone()
    // A browser shows the inline translate once no transition runs; jsdom doesn't follow it.
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el) =>
        ({
          translate: (el as HTMLElement).style.translate || "none",
        }) as CSSStyleDeclaration
    )
    const bar = document.createElement("div")
    const composer = document.createElement("div")
    const below = document.createElement("div")
    box(bar, 740, 800)
    box(composer, 540, 600)
    box(below, 900, 960)
    bar.style.translate = "0 2px"
    const stops = [bar, composer, below].map((el) => bindAvoidKeyboard(el))
    expect(bar.style.translate).toBe("0 2px")
    // A smaller visual viewport without a focused field is zoom, and nothing moves.
    move({ height: 500 })
    expect(bar.style.translate).toBe("0 2px")
    move({ height: 800 })
    const field = type()
    // The bar keeps its own 2 pixels while lifted.
    move({ height: 500 })
    expect(bar.style.translate).toBe("0 -298px")
    expect(composer.style.translate).toBe("0px -100px")
    expect(below.style.translate).toBe("")
    expect(bar.hasAttribute("data-keyboard")).toBe(true)
    // A lifted element measures where it's shown, and the lift holds.
    box(bar, 440, 500)
    move({ height: 500 })
    expect(bar.style.translate).toBe("0 -298px")
    field.blur()
    move({ height: 800 })
    expect(bar.style.translate).toBe("0 2px")
    expect(bar.hasAttribute("data-keyboard")).toBe(false)
    type()
    move({ height: 500 })
    for (const stop of stops) {
      stop()
    }
    expect(bar.style.translate).toBe("0 2px")
    expect(composer.style.translate).toBe("")
  })

  test("measures iOS's boxes, which start at the panned visual viewport, from the layout viewport", () => {
    const { visual, move } = phone()
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el) =>
        ({
          translate: (el as HTMLElement).style.translate || "none",
        }) as CSSStyleDeclaration
    )
    // iOS reports a fixed element at the top as far above the screen as the page is panned.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const top = this.hasAttribute("data-viewport-origin")
          ? -visual.offsetTop
          : 0
        return {
          top,
          bottom: top,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
        } as DOMRect
      }
    )
    const pill = document.createElement("div")
    // 603 to 630 on the page, which iOS reports 100 higher while panned by 100.
    box(pill, 503, 530)
    const stop = bindAvoidKeyboard(pill)
    type()
    move({ height: 500, offsetTop: 100 })
    expect(pill.style.translate).toBe("0px -30px")
    stop()
    expect(document.querySelector("[data-viewport-origin]")).toBe(null)
  })

  test("keeps a toolbar's own percentages, like -50% to center it, and lifts its y around them", () => {
    const { move } = phone()
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el) =>
        ({
          translate: (el as HTMLElement).style.translate || "none",
        }) as CSSStyleDeclaration
    )
    const centered = document.createElement("div")
    const middle = document.createElement("div")
    centered.style.translate = "-50% 0px"
    middle.style.translate = "-50% -50%"
    box(centered, 740, 800)
    box(middle, 740, 800)
    const stops = [centered, middle].map((el) => bindAvoidKeyboard(el))
    type()
    move({ height: 500 })
    expect(centered.style.translate).toBe("-50% -300px")
    expect(middle.style.translate).toBe("-50% calc(-50% - 300px)")
    // Shown lifted, it measures the lift from its own translate, and holds it.
    box(middle, 440, 500)
    move({ height: 500 })
    expect(middle.style.translate).toBe("-50% calc(-50% - 300px)")
    for (const stop of stops) {
      stop()
    }
    expect(middle.style.translate).toBe("-50% -50%")
  })

  test("measures again when a container around it scrolls, whose scroll doesn't bubble", () => {
    const { move } = phone()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
    const container = document.createElement("div")
    const composer = document.createElement("div")
    container.append(composer)
    document.body.append(container)
    box(composer, 440, 500)
    const stop = bindAvoidKeyboard(composer)
    type()
    move({ height: 500 })
    expect(composer.style.translate).toBe("")
    // The container scrolls the composer down, under the keyboard.
    box(composer, 540, 600)
    container.dispatchEvent(new Event("scroll"))
    expect(composer.style.translate).toBe("0px -100px")
    stop()
    vi.unstubAllGlobals()
  })

  test("doesn't measure on scroll while the keyboard is closed", () => {
    const { move } = phone()
    const frames = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("requestAnimationFrame", frames)
    vi.stubGlobal("cancelAnimationFrame", () => {})
    const bar = document.createElement("div")
    box(bar, 740, 800)
    const stop = bindAvoidKeyboard(bar)
    window.dispatchEvent(new Event("scroll"))
    expect(frames).not.toHaveBeenCalled()
    type()
    move({ height: 500 })
    window.dispatchEvent(new Event("scroll"))
    expect(frames).toHaveBeenCalledTimes(1)
    stop()
    vi.unstubAllGlobals()
  })

  test("doesn't measure itself on a focus change while the keyboard is closed", () => {
    phone()
    const styles = vi.spyOn(window, "getComputedStyle")
    const bar = document.createElement("div")
    const measure = vi.fn(
      () =>
        ({
          top: 740,
          bottom: 800,
          left: 0,
          right: 400,
          width: 400,
          height: 60,
        }) as DOMRect
    )
    bar.getBoundingClientRect = measure
    cleanups.push(bindAvoidKeyboard(bar))
    styles.mockClear()
    tabThroughButtons(20)
    expect(measure).not.toHaveBeenCalled()
    expect(styles).not.toHaveBeenCalled()
    expect(bar.hasAttribute("data-keyboard")).toBe(false)
  })

  test("does nothing without a visual viewport", () => {
    Object.defineProperty(window, "visualViewport", {
      value: undefined,
      configurable: true,
    })
    const el = document.createElement("div")
    bindAvoidKeyboard(el)()
    expect(el.style.translate).toBe("")
  })
})

describe("trackKeyboard", () => {
  test("writes the covered part and the visual viewport's height on each element", () => {
    const { move } = phone()
    const dialog = document.createElement("div")
    const region = document.createElement("div")
    const stops = [trackKeyboard(dialog), trackKeyboard(region)]
    move({ height: 500 })
    for (const el of [dialog, region]) {
      expect(el.style.getPropertyValue("--keyboard-inset")).toBe("300px")
      expect(el.style.getPropertyValue("--visual-viewport-height")).toBe(
        "500px"
      )
      expect(el.hasAttribute("data-keyboard")).toBe(true)
    }
    stops[0]()
    move({ height: 800 })
    expect(dialog.style.getPropertyValue("--keyboard-inset")).toBe("")
    expect(region.style.getPropertyValue("--keyboard-inset")).toBe("0px")
    stops[1]()
  })
})

describe("trackKeyboard after an early read", () => {
  test("measures again when the early read saw a covered strip with no keyboard", () => {
    phone(664)
    // A controlled open read the page while a side sheet in its flow made it wider.
    Object.defineProperty(window, "innerHeight", {
      value: 773,
      configurable: true,
    })
    measureViewportEarly(window)
    Object.defineProperty(window, "innerHeight", {
      value: 664,
      configurable: true,
    })
    const sheet = document.createElement("div")
    cleanups.push(trackKeyboard(sheet))
    expect(sheet.style.getPropertyValue("--keyboard-inset")).toBe("0px")
  })
})

describe("the shared viewport", () => {
  test("measures the visual viewport once per event for everything following it", () => {
    const { visual } = phone()
    cleanups.push(
      bindViewport(document.createElement("div")),
      trackKeyboard(document.createElement("div")),
      trackKeyboard(document.createElement("div"))
    )
    const reads = countHeightReads(visual)
    visual.dispatchEvent(new Event("scroll"))
    expect(reads.count).toBe(1)
  })

  test("stops listening once the last element stops following it", () => {
    const { visual } = phone()
    const stops = [
      bindViewport(document.createElement("div")),
      trackKeyboard(document.createElement("div")),
    ]
    const reads = countHeightReads(visual)
    for (const stop of stops) {
      stop()
    }
    visual.dispatchEvent(new Event("scroll"))
    window.dispatchEvent(new Event("resize"))
    tabThroughButtons(2)
    expect(reads.count).toBe(0)
  })
})
