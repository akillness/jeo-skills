// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest"
import { createPointerKind, pointerKindOf } from "../src/index"

// A window of its own, since pointer kinds share queries per window, whose
// media features match `matching`, which `change` can swap.
function device(matching: string[]) {
  let current = new Set(matching)
  const lists = new Map<string, MediaQueryList & EventTarget>()
  const added = vi.fn()
  const matchMedia = (query: string) => {
    const list = Object.defineProperties(new EventTarget(), {
      media: { value: query },
      matches: { get: () => current.has(query) },
    }) as unknown as MediaQueryList & EventTarget
    const add = list.addEventListener.bind(list)
    list.addEventListener = ((type: string, listener: EventListener) => {
      added()
      add(type, listener)
    }) as MediaQueryList["addEventListener"]
    lists.set(query, list)
    return list
  }
  const view = { matchMedia } as unknown as Window
  const change = (next: string[]) => {
    current = new Set(next)
    for (const list of lists.values()) {
      list.dispatchEvent(new Event("change"))
    }
  }
  return { view, change, added }
}

const phone = [
  "(pointer: coarse)",
  "(hover: none)",
  "(any-pointer: coarse)",
  "(any-hover: none)",
]
const tabletWithTrackpad = [
  "(pointer: coarse)",
  "(hover: none)",
  "(any-pointer: fine)",
  "(any-pointer: coarse)",
  "(any-hover: hover)",
]

describe("createPointerKind", () => {
  test("starts unknown, or at the server's guess, then reads the device", () => {
    const { view } = device(phone)
    const kind = createPointerKind({ view, initial: pointerKindOf("?1") })
    expect(kind.initialState).toEqual({
      pointer: "coarse",
      hover: "none",
      anyPointer: "unknown",
      anyHover: "unknown",
    })
    expect(kind.get()).toEqual({
      pointer: "coarse",
      hover: "none",
      anyPointer: "coarse",
      anyHover: "none",
    })
    expect(kind.get()).toBe(kind.get())
    expect(createPointerKind().initialState.pointer).toBe("unknown")
  })

  test("hears a trackpad attached to a tablet, sharing one set of listeners between kinds", () => {
    const { view, change, added } = device(phone)
    const first = createPointerKind({ view })
    const second = createPointerKind({ view })
    const heard = vi.fn()
    const stop = first.subscribe(heard)
    second.subscribe(() => {})
    const listening = added.mock.calls.length
    change(tabletWithTrackpad)
    expect(heard.mock.lastCall?.[0]).toEqual({
      pointer: "coarse",
      hover: "none",
      anyPointer: "fine",
      anyHover: "hover",
    })
    expect(added.mock.calls.length).toBe(listening)
    stop()
    heard.mockClear()
    change(phone)
    expect(heard).not.toHaveBeenCalled()
  })

  test("reads unknown where the browser doesn't know the features", () => {
    const { view } = device([])
    expect(createPointerKind({ view }).get()).toEqual({
      pointer: "unknown",
      hover: "unknown",
      anyPointer: "unknown",
      anyHover: "unknown",
    })
  })

  test("guesses from Sec-CH-UA-Mobile only when it's sent", () => {
    expect(pointerKindOf("?0")).toEqual({ pointer: "fine", hover: "hover" })
    expect(pointerKindOf(null)).toEqual({})
  })
})
