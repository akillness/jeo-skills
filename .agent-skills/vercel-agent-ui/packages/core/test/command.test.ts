import { describe, expect, test, vi } from "vitest"
import { command, type CommandData } from "../src/components/command/command"
import {
  commandShortcuts,
  findCommand,
  pageItems,
} from "../src/components/command/command-data"
import { fuzzyFilter, fuzzyScore } from "../src/foundation/text/fuzzy"
import {
  createFilteredListbox,
  filterData,
  itemKey,
  type ListData,
} from "../src/foundation/lists/listbox"
import { attrs } from "../src/foundation/kernel/part"
import { createStore } from "../src/foundation/kernel/store"
import { fakeElement } from "./selects"

const commands: CommandData = [
  {
    type: "group",
    label: "Suggestions",
    items: [
      { value: "calendar", label: "Calendar" },
      { value: "emoji", label: "Search Emoji", keywords: ["smiley"] },
      { value: "calculator", label: "Calculator", disabled: true },
    ],
  },
  { type: "separator" },
  {
    type: "group",
    label: "Settings",
    items: [
      { value: "profile", label: "Profile", shortcut: "mod+p" },
      {
        value: "theme",
        label: "Change theme…",
        items: [
          { value: "light", label: "Light", shortcut: "mod+shift+l" },
          { value: "dark", label: "Dark" },
        ],
      },
      { value: "settings", label: "Settings", shortcut: "mod+s" },
    ],
  },
]

const keys = (instance: ReturnType<typeof command>) =>
  instance.api.internal.listbox.entries().map((entry) => entry.key)

// Typing in the search field, as the core reads it.
const type = (instance: ReturnType<typeof command>, text: string) =>
  instance.api.internal.typed({ value: text } as HTMLInputElement)

// A key press in the search field, as the core reads it.
function key(name: string, value = "") {
  const event = {
    key: name,
    target: { value },
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true
    },
  }
  return event as unknown as KeyboardEvent
}

describe("fuzzy scores", () => {
  test("the whole text beats a prefix, which beats a word, a substring and scattered letters", () => {
    const scores = [
      "Set",
      "Settings",
      "Quick setup",
      "Assets",
      "Show emoji teams",
    ].map((text) => fuzzyScore(text, "set"))
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(scores.every((score) => score > 0)).toBe(true)
  })

  test("letters in order match across words, and word starts count most", () => {
    expect(fuzzyScore("Git push", "gp")).toBeGreaterThan(
      fuzzyScore("Grep", "gp")
    )
    expect(fuzzyScore("git push", "git ps")).toBeGreaterThan(0)
    expect(fuzzyScore("Calendar", "xyz")).toBe(0)
    expect(fuzzyScore("Calendar", "rac")).toBe(0)
  })

  test("case and accents are ignored", () => {
    expect(fuzzyScore("Éclair", "ECL")).toBeGreaterThan(0.9)
  })
})

describe("ranking", () => {
  test("data ranks best matches first, within groups and among them, without separators", () => {
    const ranked = filterData(commands as ListData, "se", fuzzyFilter, {
      rank: true,
    })
    expect(ranked).toEqual([
      {
        type: "group",
        label: "Settings",
        items: [{ value: "settings", label: "Settings", shortcut: "mod+s" }],
      },
      {
        type: "group",
        label: "Suggestions",
        items: [
          { value: "emoji", label: "Search Emoji", keywords: ["smiley"] },
        ],
      },
    ])
  })

  test("an empty query keeps the source order", () => {
    expect(
      filterData(commands as ListData, "", fuzzyFilter, { rank: true })
    ).toBe(commands)
  })

  test("a scoring function ranks, and 0 hides", () => {
    const items: ListData = ["a", "bb", "ccc"]
    const byLength = (item: { label: string }) => item.label.length - 1
    expect(filterData(items, "x", byLength, { rank: true })).toEqual([
      "ccc",
      "bb",
    ])
  })

  test("separators stay while scores move no entry", () => {
    const separator = { type: "separator" } as const
    const items: ListData = ["Apple", "Apricot", separator, "Avocado", "Banana"]
    const startsWithA = (item: { label: string }) => item.label.startsWith("A")
    expect(filterData(items, "a", startsWithA, { rank: true })).toEqual([
      "Apple",
      "Apricot",
      separator,
      "Avocado",
    ])
    const avocadoFirst = (item: { label: string }) =>
      item.label === "Avocado" ? 2 : 1
    expect(filterData(items, "a", avocadoFirst, { rank: true })).toEqual([
      "Avocado",
      "Apple",
      "Apricot",
      "Banana",
    ])
  })

  test("10,000 items: a fuzzy keystroke stays well under a frame", () => {
    const many: ListData = Array.from({ length: 10_000 }, (_, index) => ({
      value: `item-${index}`,
      label: `Item ${index} ${index % 7 === 0 ? "settings" : "action"}`,
    }))
    let query = ""
    const listbox = createFilteredListbox({
      store: createStore({ highlighted: null as string | null }, [
        "highlighted",
      ]),
      focus: "virtual",
      items: () => many,
      toKey: (value) => itemKey(value),
      filter: () => fuzzyFilter,
      rank: () => true,
      query: () => query,
      loop: () => true,
      active: () => true,
    })
    // The slowest keystroke of a run, from an empty query.
    const slowest = () => {
      query = ""
      listbox.entries()
      const times: number[] = []
      for (const next of ["s", "se", "set", "sett", "99"]) {
        const start = performance.now()
        query = next
        listbox.entries()
        times.push(performance.now() - start)
      }
      return Math.max(...times)
    }
    // The best of three runs, so a busy machine's pauses don't count as filtering time.
    expect(Math.min(slowest(), slowest(), slowest())).toBeLessThan(50)
  })
})

describe("command data", () => {
  test("pages are the items of the command with that value", () => {
    expect(pageItems(commands, [])).toBe(commands)
    expect(pageItems(commands, ["theme"])).toHaveLength(2)
    expect(pageItems(commands, ["missing"])).toBeUndefined()
  })

  test("commands and shortcuts are found on every page", () => {
    expect(findCommand(commands, "dark")?.label).toBe("Dark")
    expect(commandShortcuts(commands).map((entry) => entry.value)).toEqual([
      "profile",
      "light",
      "settings",
    ])
  })
})

describe("command headless", () => {
  test("the first command is highlighted at first, without reporting a change", () => {
    const onValueChange = vi.fn()
    const instance = command({ id: "c", items: commands, onValueChange })
    expect(instance.api.getValue()).toBe("calendar")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("typing ranks the commands and highlights the best match", () => {
    const onValueChange = vi.fn()
    const instance = command({ id: "c", items: commands, onValueChange })
    type(instance, "se")
    expect(keys(instance)).toEqual(["settings", "emoji"])
    expect(instance.api.getValue()).toBe("settings")
    expect(onValueChange).toHaveBeenLastCalledWith(
      "settings",
      expect.objectContaining({ reason: "input-change", index: 0 })
    )
  })

  test("arrow keys skip disabled commands and wrap", () => {
    const instance = command({ id: "c", items: commands })
    const { onInputKeyDown } = instance.api.internal
    onInputKeyDown(key("ArrowDown"))
    expect(instance.api.getValue()).toBe("emoji")
    onInputKeyDown(key("ArrowDown"))
    expect(instance.api.getValue()).toBe("profile")
    onInputKeyDown(key("ArrowUp"))
    onInputKeyDown(key("ArrowUp"))
    onInputKeyDown(key("ArrowUp"))
    expect(instance.api.getValue()).toBe("settings")
  })

  test("Enter runs the highlighted command, and a Promise marks it pending", async () => {
    let finish = () => {}
    const onAction = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve))
    )
    const instance = command({ id: "c", items: commands, onAction })
    instance.api.internal.onInputKeyDown(key("Enter"))
    expect(onAction).toHaveBeenCalledWith("calendar", expect.anything())
    expect(instance.get()).toMatchObject({ pending: ["calendar"] })
    expect(attrs(instance.part("item", { value: "calendar" }))).toMatchObject({
      "aria-busy": "true",
      "aria-disabled": "true",
    })
    instance.api.run("calendar")
    expect(onAction).toHaveBeenCalledTimes(1)
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(instance.get()).toMatchObject({ pending: [] })
  })

  test("a click on a disabled or pending command is canceled, so one rendered as a link stays put", () => {
    const instance = command({
      id: "c",
      items: commands,
      onAction: () => new Promise(() => {}),
    })
    const click = () => new Event("click", { cancelable: true })
    const disabled = click()
    instance.api.internal.press("calculator", disabled)
    expect(disabled.defaultPrevented).toBe(true)
    const first = click()
    instance.api.internal.press("calendar", first)
    expect(first.defaultPrevented).toBe(false)
    const pending = click()
    instance.api.internal.press("calendar", pending)
    expect(pending.defaultPrevented).toBe(true)
  })

  test("a controller's run() hands onSelect a real select Event, whose preventDefault() skips onAction", () => {
    const onAction = vi.fn()
    const instance = command({ id: "c", items: commands, onAction })
    let received: Event | undefined
    instance.part("item", {
      value: "profile",
      onSelect: (event: Event) => {
        received = event
        event.preventDefault()
      },
    })
    instance.api.run("profile")
    expect(received).toBeInstanceOf(Event)
    expect(received).toMatchObject({
      type: "select",
      cancelable: true,
      defaultPrevented: true,
      target: null,
    })
    expect(onAction).not.toHaveBeenCalled()
  })

  test("a rejected action keeps its reason as the command's error until it runs again", async () => {
    const instance = command({
      id: "c",
      items: commands,
      onAction: () => Promise.reject("offline"),
    })
    instance.api.run("profile")
    await new Promise((resolve) => setTimeout(resolve))
    expect(instance.get()).toMatchObject({
      error: { key: "profile", reason: "offline" },
    })
  })

  test("a command that fails while another runs leaves the other pending", async () => {
    let fail = (_reason: unknown) => {}
    const onAction = (value: string) =>
      new Promise<void>((_resolve, reject) => {
        if (value === "profile") {
          fail = reject
        }
      })
    const instance = command({ id: "c", items: commands, onAction })
    instance.api.run("profile")
    instance.api.run("settings")
    fail("offline")
    await new Promise((resolve) => setTimeout(resolve))
    expect(instance.get()).toMatchObject({
      pending: ["settings"],
      error: { key: "profile", reason: "offline" },
    })
  })

  test("a pending command waits while another command runs", async () => {
    const finishes: (() => void)[] = []
    const onAction = vi.fn(
      () => new Promise<void>((resolve) => finishes.push(resolve))
    )
    const instance = command({ id: "c", items: commands, onAction })
    instance.api.run("profile")
    instance.api.run("settings")
    instance.api.run("profile")
    expect(onAction).toHaveBeenCalledTimes(2)
    expect(instance.get()).toMatchObject({ pending: ["profile", "settings"] })
    finishes[0]()
    await new Promise((resolve) => setTimeout(resolve))
    expect(instance.get()).toMatchObject({ pending: ["settings"] })
    instance.api.run("profile")
    expect(onAction).toHaveBeenCalledTimes(3)
  })

  test("two items with one value warn in development, naming the component and the value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const listbox = createFilteredListbox({
      store: createStore({ highlighted: null as string | null }, [
        "highlighted",
      ]),
      focus: "virtual",
      items: () => undefined,
      toKey: (value) => itemKey(value),
      filter: () => undefined,
      query: () => "",
      loop: () => true,
      active: () => true,
    })
    const item = (index: number) => {
      const el = fakeElement(index, "DIV")
      el.setAttribute("data-slot", "command-item")
      return el
    }
    const docs = item(0)
    const meta = () => ({ value: "https://example.com/docs", label: "Docs" })
    listbox.register("https://example.com/docs", docs, meta)
    // The same element registering again, like under React's StrictMode, is the same item.
    listbox.register("https://example.com/docs", docs, meta)
    expect(warn).not.toHaveBeenCalled()
    listbox.register("https://example.com/docs", item(1), meta)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'command: Two items have the value "https://example.com/docs"'
      )
    )
    warn.mockRestore()
  })

  test("a command with items opens its page, and Backspace in the empty field goes back with the text", () => {
    const onPagesChange = vi.fn()
    const instance = command({ id: "c", items: commands, onPagesChange })
    type(instance, "them")
    instance.api.run("theme")
    expect(instance.api.getPages()).toEqual(["theme"])
    expect(instance.api.getQuery()).toBe("")
    expect(keys(instance)).toEqual(["light", "dark"])
    expect(instance.api.getValue()).toBe("light")
    instance.api.internal.onInputKeyDown(key("Backspace"))
    expect(onPagesChange).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ reason: "back" })
    )
    expect(instance.api.getQuery()).toBe("them")
  })

  test("Escape clears the text, then goes back a page, then leaves the key alone", () => {
    const instance = command({
      id: "c",
      items: commands,
      defaultPages: ["theme"],
    })
    type(instance, "da")
    const first = key("Escape")
    instance.api.internal.onInputKeyDown(first)
    expect(instance.api.getQuery()).toBe("")
    expect(first.defaultPrevented).toBe(true)
    instance.api.internal.onInputKeyDown(key("Escape"))
    expect(instance.api.getPages()).toEqual([])
    const last = key("Escape")
    instance.api.internal.onInputKeyDown(last)
    expect(last.defaultPrevented).toBe(false)
  })

  test("results that keep the highlighted command keep the highlight", () => {
    const first: CommandData = ["Alpha", "Beta"]
    const instance = command({ id: "c", items: first })
    instance.api.setValue("Beta")
    instance.setOptions({ id: "c", items: ["Gamma", "Beta"] })
    expect(instance.api.getValue()).toBe("Beta")
    instance.setOptions({ id: "c", items: ["Gamma"] })
    expect(instance.api.getValue()).toBe("Gamma")
  })

  test("without autoHighlight, nothing is highlighted until the keys move", () => {
    const instance = command({ id: "c", items: commands, autoHighlight: false })
    expect(instance.api.getValue()).toBe(null)
    type(instance, "cal")
    expect(instance.api.getValue()).toBe(null)
    instance.api.internal.onInputKeyDown(key("ArrowDown"))
    expect(instance.api.getValue()).toBe("calendar")
  })

  test("a controlled value moves the highlight only when it comes back", () => {
    const onValueChange = vi.fn()
    const instance = command({
      id: "c",
      items: commands,
      value: "profile",
      onValueChange,
    })
    instance.api.internal.onInputKeyDown(key("ArrowDown"))
    expect(onValueChange).toHaveBeenLastCalledWith("theme", expect.anything())
    expect(instance.api.getValue()).toBe("profile")
    instance.setOptions({
      id: "c",
      items: commands,
      value: "theme",
      onValueChange,
    })
    expect(instance.get()).toMatchObject({ highlighted: "theme" })
  })

  test("with the text and the value both controlled, typing asks for the best match with the text, once", () => {
    const onQueryChange = vi.fn()
    const onValueChange = vi.fn()
    const options = {
      id: "c",
      items: commands,
      query: "",
      value: "calendar",
      onQueryChange,
      onValueChange,
    }
    const instance = command(options)
    type(instance, "se")
    expect(onQueryChange).toHaveBeenLastCalledWith("se", expect.anything())
    expect(onValueChange).toHaveBeenLastCalledWith(
      "settings",
      expect.objectContaining({ reason: "input-change", index: 0 })
    )
    expect(instance.get()).toMatchObject({ query: "", highlighted: "calendar" })
    instance.setOptions({ ...options, query: "se", value: "settings" })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(keys(instance)).toEqual(["settings", "emoji"])
    expect(instance.get()).toMatchObject({ highlighted: "settings" })
  })

  test("an app that takes the value but keeps its text is asked for the highlight its text has", async () => {
    const onValueChange = vi.fn()
    const options = {
      id: "c",
      items: commands,
      query: "",
      value: "calendar",
      onQueryChange() {},
      onValueChange,
    }
    const instance = command(options)
    type(instance, "se")
    expect(onValueChange).toHaveBeenLastCalledWith(
      "settings",
      expect.anything()
    )
    instance.setOptions({ ...options, value: "settings" })
    await Promise.resolve()
    expect(onValueChange).toHaveBeenLastCalledWith(
      "calendar",
      expect.anything()
    )
  })

  test("with filter off, the highlight waits for the items the app sends for the text", () => {
    const onValueChange = vi.fn()
    const instance = command({
      id: "c",
      items: commands,
      filter: false,
      query: "",
      value: "profile",
      onQueryChange() {},
      onValueChange,
    })
    type(instance, "se")
    expect(onValueChange).not.toHaveBeenCalled()
  })
})
