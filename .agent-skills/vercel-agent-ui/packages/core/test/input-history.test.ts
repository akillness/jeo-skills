// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import { createChange } from "../src/foundation/kernel/input-source"
import { bind } from "../src/foundation/kernel/part"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { createInputHistory } from "../src/foundation/text/input-history"

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

type FieldOptions = {
  history?: string[]
  onValueChange?: (value: string, details: { cancel: () => void }) => void
}

const field = definePrimitive({
  name: "field",
  options: { history: "value", onValueChange: "callback" },
  state: (_options: FieldOptions) => ({ value: "" }),
  api: (context) => {
    const change = createChange(context)
    const history = createInputHistory({
      entries: () => context.options().history,
      read: () => context.store.get().value,
      write: (value, event) =>
        change("value", value, { reason: "history-key", event }),
    })
    return {
      history,
      type: (value: string) => context.store.set({ value }),
    }
  },
  slots: (slot) => ({
    root: slot({
      on: { keydown: (event, { api }) => api.history.keydown(event) },
    }),
  }),
})

function mount(tag: "input" | "textarea", options: FieldOptions = {}) {
  const instance = field({ id: tag, ...options })
  const el = document.createElement(tag)
  document.body.append(el)
  cleanups.push(bind(instance.part("root"), el), () => instance.destroy())
  instance.subscribe(() => {
    el.value = instance.get().value
  })
  const type = (value: string) => {
    el.value = value
    instance.api.type(value)
  }
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {
      key,
      cancelable: true,
      bubbles: true,
      ...init,
    })
    el.dispatchEvent(event)
    return event
  }
  return { el, instance, type, press }
}

describe("createInputHistory in an input", () => {
  test("ArrowUp steps back, ArrowDown forward, and past the newest brings back the draft", () => {
    const { el, type, press } = mount("input", { history: ["one", "two"] })
    type("dra")
    expect(press("ArrowUp").defaultPrevented).toBe(true)
    expect(el.value).toBe("two")
    press("ArrowUp")
    expect(el.value).toBe("one")
    expect(press("ArrowUp").defaultPrevented).toBe(false)
    expect(el.value).toBe("one")
    press("ArrowDown")
    expect(el.value).toBe("two")
    press("ArrowDown")
    expect(el.value).toBe("dra")
    expect(press("ArrowDown").defaultPrevented).toBe(false)
  })

  test("puts the caret at the end of the recalled value", () => {
    const { el, press } = mount("input", { history: ["hello"] })
    press("ArrowUp")
    expect([el.selectionStart, el.selectionEnd]).toEqual([5, 5])
  })

  test("keeps edits to a recalled value while browsing", () => {
    const { el, type, press } = mount("input", { history: ["one", "two"] })
    press("ArrowUp")
    type("two!")
    press("ArrowUp")
    press("ArrowDown")
    expect(el.value).toBe("two!")
  })

  test("starts over from the newest when the entries change", () => {
    const { el, instance, type, press } = mount("input", { history: ["one"] })
    press("ArrowUp")
    type("two")
    instance.setOptions({ id: "input", history: ["one", "two"] })
    type("")
    press("ArrowUp")
    expect(el.value).toBe("two")
    press("ArrowDown")
    expect(el.value).toBe("")
  })

  test("notices entries added to the same array", () => {
    const history = ["one"]
    const { el, type, press } = mount("input", { history })
    press("ArrowUp")
    history.push("two")
    type("")
    press("ArrowUp")
    expect(el.value).toBe("two")
  })

  test("a canceled change keeps the value and the key", () => {
    const onValueChange = vi.fn(
      (_value: string, details: { cancel: () => void }) => details.cancel()
    )
    const { el, press } = mount("input", { history: ["one"], onValueChange })
    expect(press("ArrowUp").defaultPrevented).toBe(false)
    expect(el.value).toBe("")
    expect(onValueChange).toHaveBeenCalledWith(
      "one",
      expect.objectContaining({ reason: "history-key" })
    )
  })

  test("leaves the keys alone with a modifier, while read-only, with a popup open, or on a number or email field", () => {
    const { el, press } = mount("input", { history: ["one"] })
    expect(press("ArrowUp", { shiftKey: true }).defaultPrevented).toBe(false)
    expect(press("ArrowUp", { altKey: true }).defaultPrevented).toBe(false)
    el.readOnly = true
    expect(press("ArrowUp").defaultPrevented).toBe(false)
    el.readOnly = false
    el.setAttribute("aria-expanded", "true")
    expect(press("ArrowUp").defaultPrevented).toBe(false)
    el.removeAttribute("aria-expanded")
    el.setAttribute("type", "number")
    expect(press("ArrowUp").defaultPrevented).toBe(false)
    el.setAttribute("type", "email")
    expect(press("ArrowUp").defaultPrevented).toBe(false)
    expect(el.value).toBe("")
  })

  test("does nothing without entries", () => {
    const { press } = mount("input")
    expect(press("ArrowUp").defaultPrevented).toBe(false)
  })
})

describe("createInputHistory in a textarea", () => {
  test("reaches the entries only from the first line going up and the last going down", () => {
    const { el, type, press } = mount("textarea", { history: ["one"] })
    type("first\nsecond")
    el.setSelectionRange(9, 9)
    expect(press("ArrowUp").defaultPrevented).toBe(false)
    el.setSelectionRange(2, 2)
    expect(press("ArrowDown").defaultPrevented).toBe(false)
    expect(press("ArrowUp").defaultPrevented).toBe(true)
    expect(el.value).toBe("one")
    press("ArrowDown")
    expect(el.value).toBe("first\nsecond")
  })

  test("leaves the keys alone while text is selected", () => {
    const { el, type, press } = mount("textarea", { history: ["one"] })
    type("draft")
    el.setSelectionRange(0, 3)
    expect(press("ArrowUp").defaultPrevented).toBe(false)
  })

  test("leaves the keys to a menu open on the textarea, which marks it with data-open", () => {
    const { el, press } = mount("textarea", { history: ["one"] })
    el.setAttribute("data-open", "")
    expect(press("ArrowUp").defaultPrevented).toBe(false)
    expect(el.value).toBe("")
    el.removeAttribute("data-open")
    expect(press("ArrowUp").defaultPrevented).toBe(true)
    expect(el.value).toBe("one")
  })
})

describe("createInputHistory with any value", () => {
  test("steps through lists of tokens where its own edge says so", () => {
    let value: string[] = []
    const history = createInputHistory<string[]>({
      entries: () => [["a", "b"]],
      read: () => value,
      write: (next) => {
        value = next
      },
      atEdge: () => true,
    })
    const up = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      cancelable: true,
    })
    expect(history.keydown(up)).toBe(true)
    expect(up.defaultPrevented).toBe(true)
    expect(value).toEqual(["a", "b"])
    history.reset()
    expect(
      history.keydown(new KeyboardEvent("keydown", { key: "ArrowDown" }))
    ).toBe(false)
  })
})

describe("entries with keys", () => {
  type Message = { id: string; text: string }
  const up = { key: "ArrowUp", target: null } as unknown as KeyboardEvent
  const recall = (
    messages: () => Message[],
    getEntryKey?: (m: Message) => string
  ) => {
    let value: Message = { id: "draft", text: "" }
    const written: string[] = []
    const history = createInputHistory<Message>({
      entries: () => messages().map((m) => ({ ...m })),
      read: () => value,
      write: (next) => {
        value = next
        written.push(next.text)
      },
      atEdge: () => true,
      getEntryKey,
    })
    return {
      press: () =>
        history.keydown({ ...up, preventDefault() {} } as KeyboardEvent),
      written,
    }
  }

  test("values made again from the same messages keep their place, and a new one doesn't move it", () => {
    const messages = [
      { id: "m1", text: "one" },
      { id: "m2", text: "two" },
      { id: "m3", text: "three" },
    ]
    const keyed = recall(
      () => messages,
      (m) => m.id
    )
    keyed.press()
    keyed.press()
    messages.push({ id: "m4", text: "four" })
    keyed.press()
    expect(keyed.written).toEqual(["three", "two", "one"])
  })
})
