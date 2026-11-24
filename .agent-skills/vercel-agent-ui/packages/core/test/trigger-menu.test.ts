import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  triggerMenu,
  type TriggerDefinition,
  type TriggerMenuOptions,
} from "../src/components/trigger-menu/trigger-menu"
import { keep, release } from "../src/foundation/kernel/keep"
import { fakeEditor } from "./fake-editor"
import { kept } from "./kept"

const people = [
  { value: "alice", label: "Alice" },
  { value: "alan", label: "Alan" },
  { value: "bob", label: "Bob" },
]

function setup(
  triggers: TriggerDefinition[],
  options: Partial<TriggerMenuOptions> = {}
) {
  const editor = fakeEditor()
  const instance = kept(
    triggerMenu({ id: "menu", triggers, editor, ...options })
  )
  const visible = () =>
    instance.api.internal.listbox.entries().map((entry) => entry.label)
  return {
    editor,
    instance,
    api: instance.api,
    visible,
    state: () => instance.get() as { open: boolean; query: string },
  }
}

describe("matching", () => {
  test("typing a trigger opens the menu, and the query filters it", () => {
    const { editor, state, visible } = setup([{ char: "@", items: people }])
    editor.type("hi @")
    expect(state().open).toBe(true)
    editor.type("al")
    expect(state().query).toBe("al")
    expect(visible()).toEqual(["Alice", "Alan"])
  })

  test("an edit that isn't the user's never opens the menu", () => {
    const { editor, state } = setup([{ char: "@", items: people }])
    editor.type("@al", { user: false })
    expect(state().open).toBe(false)
  })

  test("a caret move into a match doesn't open it, and one out of it closes", () => {
    const onOpenChange = vi.fn()
    const { editor, state } = setup([{ char: "@", items: people }], {
      onOpenChange,
    })
    editor.type("@al x")
    expect(state().open).toBe(false)
    editor.moveCaret(3)
    expect(state().open).toBe(false)
    editor.moveCaret(5)
    editor.type(" @")
    expect(state().open).toBe(true)
    editor.moveCaret(1)
    expect(state().open).toBe(false)
    expect(onOpenChange.mock.calls.at(-1)?.[1].reason).toBe("caret-move")
  })

  test("closing empties the query, and reports only the queries typed while open", () => {
    const onQueryChange = vi.fn()
    const { editor, state } = setup([{ char: "@", items: people }], {
      onQueryChange,
    })
    editor.type("@al")
    expect(onQueryChange.mock.calls.map(([query]) => query)).toEqual(["al"])
    editor.moveCaret(0)
    expect(state()).toMatchObject({ open: false, query: "" })
    expect(onQueryChange).toHaveBeenCalledTimes(1)
  })

  test("a query that stops matching closes the menu, and Backspace reopens it", () => {
    const { editor, state } = setup([{ char: "@", items: people }])
    editor.type("@alx")
    expect(state().open).toBe(false)
    editor.backspace()
    expect(state().open).toBe(true)
  })
})

describe("choosing", () => {
  test("choosing replaces the trigger and the query, and reports the value", () => {
    const onSelect = vi.fn()
    const { editor, api } = setup([{ char: "@", items: people }], { onSelect })
    editor.type("hi @bo")
    api.internal.choose("bob")
    expect(editor.text).toBe("hi @Bob ")
    expect(onSelect).toHaveBeenCalledWith(
      "bob",
      expect.objectContaining({ trigger: "@", arguments: {} })
    )
  })

  test("preventDefault skips the insertion", () => {
    const { editor, api } = setup([{ char: "@", items: people }], {
      onSelect: (value, details) => details.preventDefault(),
    })
    editor.type("@bo")
    api.internal.choose("bob")
    expect(editor.text).toBe("@bo")
  })

  test("an editor that takes tokens gets one, pending while onSelect's Promise runs", () => {
    const editor = fakeEditor()
    Object.assign(editor, { tokens: true })
    const pending: unknown[] = []
    const replace = editor.replace
    editor.replace = (range, content, options) => {
      pending.push(options?.pending)
      replace(range, content, options)
    }
    const instance = kept(
      triggerMenu({
        id: "menu",
        editor,
        triggers: [{ char: "@", type: "person", items: people }],
        onSelect: () => Promise.resolve({ label: "@Bob Jones" }),
      })
    )
    editor.type("@bo")
    instance.api.internal.choose("bob")
    expect(editor.replaced.at(-1)).toEqual({
      type: "person",
      value: "bob",
      label: "Bob",
      data: { trigger: "@" },
    })
    expect(pending.at(-1)).toBeInstanceOf(Promise)
    expect((instance.get() as { open: boolean }).open).toBe(false)
  })
})

describe("controller", () => {
  test("setOpen(true) reopens the match that close() closed", () => {
    const { editor, api, state } = setup([{ char: "@", items: people }])
    editor.type("hi @al")
    api.close()
    expect(state().open).toBe(false)
    api.setOpen(true)
    expect(state().open).toBe(true)
    expect(state().query).toBe("al")
  })

  test("setOpen(true) without a match at the caret stays closed", () => {
    const { editor, api, state } = setup([{ char: "@", items: people }])
    editor.type("hi")
    api.setOpen(true)
    expect(state().open).toBe(false)
  })
})

describe("lifecycle", () => {
  test("an editor a TriggerMenuInput built is followed again once the instance is kept again", () => {
    const { instance, state } = setup([{ char: "@", items: people }])
    const own = fakeEditor()
    instance.api.internal.setOwnEditor(own)
    release(instance)
    own.type("hi @")
    expect(state().open).toBe(false)
    keep(instance)
    own.type("a")
    expect(state().open).toBe(true)
  })
})

describe("loading", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test("a stale load never lands, and its signal aborts", async () => {
    const signals: Record<string, AbortSignal> = {}
    const resolvers: Record<
      string,
      (items: { value: string; label: string }[]) => void
    > = {}
    const { editor, visible } = setup([
      {
        char: "#",
        items: (query, { signal }) => {
          signals[query] = signal
          return new Promise((resolve) => (resolvers[query] = resolve))
        },
      },
    ])
    editor.type("#a")
    await vi.advanceTimersByTimeAsync(200)
    editor.type("l")
    await vi.advanceTimersByTimeAsync(200)
    resolvers.al([{ value: "alpha", label: "alpha" }])
    await vi.advanceTimersByTimeAsync(0)
    resolvers.a([{ value: "stale", label: "stale" }])
    await vi.advanceTimersByTimeAsync(0)
    expect(signals.a.aborted).toBe(true)
    expect(visible()).toEqual(["alpha"])
  })

  test("closing before a load starts still lets the next open load", async () => {
    const queries: string[] = []
    const { editor, instance, visible } = setup([
      {
        char: "#",
        items: async (query) => {
          queries.push(query)
          return [{ value: "alpha", label: "alpha" }]
        },
      },
    ])
    editor.type("#")
    editor.backspace()
    editor.type("#")
    await vi.advanceTimersByTimeAsync(200)
    expect(queries).toEqual([""])
    expect(visible()).toEqual(["alpha"])
    expect(instance.get()).toMatchObject({ open: true, loading: "idle" })
  })
})
