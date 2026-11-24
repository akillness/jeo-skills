import { describe, expect, test, vi } from "vitest"
import { accordion } from "../src/components/accordion/accordion"
import { timeline } from "../src/components/timeline/timeline"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { combobox } from "../src/components/combobox/combobox"
import { command } from "../src/components/command/command"
import { type Listbox } from "../src/foundation/lists/listbox"
import { listbox } from "../src/components/listbox/listbox-root"
import { menu } from "./menu-parts"
import { radioGroup } from "../src/components/radio/radio"
import { select } from "../src/components/select/select"
import { tabs } from "../src/components/tabs/tabs"
import { toggle, toggleGroup } from "../src/components/toggle/toggle"
import { toolbar } from "../src/components/toolbar/toolbar"
import { triggerMenu } from "../src/components/trigger-menu/trigger-menu"
import { fakeEditor } from "./fake-editor"
import {
  animatingElement,
  expectNoMissedUpdates,
  fakeElement,
  type Part,
  type Step,
} from "./selects"
import { attrs, bind, press as partPress } from "../src/foundation/kernel/part"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import { kept } from "./kept"
import type { GridCell } from "../src/foundation/focus/grid-focus"
import { sheet } from "./sheet"

// Every primitive whose slots have `selects`: each test drives the selected
// key through every kind of change, to and from null and to values no part
// has, along with the other changes the primitive makes, and fails on any
// part that changed without hearing about it.

describe("menu items select on the highlighted item and on their checked entry", () => {
  const indicator = (id: string, itemKey: string, group?: string) => ({
    slot: "item-indicator",
    props: {
      id,
      item: group ? "radio-item" : "checkbox-item",
      itemKey,
      group,
      keepMounted: true,
    },
  })
  const parts: Part[] = [
    { slot: "trigger", props: {} },
    { slot: "content", props: {} },
    { slot: "viewport", props: {} },
    { slot: "item", props: { value: "new" } },
    { slot: "item", props: { value: "save", disabled: true } },
    { slot: "group", props: { id: "view" } },
    { slot: "group-label", props: { group: "view" } },
    { slot: "separator", props: { id: "s" } },
    { slot: "shortcut", props: { id: "k" } },
    { slot: "item-icon", props: { id: "icon" } },
    { slot: "checkbox-item", props: { value: "sidebar" } },
    indicator("sidebar-check", "sidebar"),
    {
      slot: "checkbox-item",
      props: { value: "statusbar", defaultChecked: true },
    },
    indicator("statusbar-check", "statusbar"),
    // Controlled: a toggle asks, and only a new `checked` would change it.
    { slot: "checkbox-item", props: { value: "minimap", checked: true } },
    indicator("minimap-check", "minimap"),
    // Mounts later, so its entry is added by its first toggle.
    { slot: "checkbox-item", props: { value: "rulers" } },
    {
      slot: "radio-group",
      props: { id: "sort", name: "sort", defaultValue: "name" },
    },
    { slot: "radio-item", props: { group: "sort", value: "name" } },
    indicator("sort-name", "name", "sort"),
    { slot: "radio-item", props: { group: "sort", value: "date" } },
    indicator("sort-date", "date", "sort"),
    // The same value in another group is another item.
    { slot: "radio-group", props: { id: "order", name: "order" } },
    { slot: "radio-item", props: { group: "order", value: "name" } },
    indicator("order-name", "name", "order"),
    // A controlled group: choosing asks, and only a new `value` would change it.
    {
      slot: "radio-group",
      props: { id: "theme", name: "theme", value: "dark" },
    },
    { slot: "radio-item", props: { group: "theme", value: "light" } },
    indicator("theme-light", "light", "theme"),
  ]

  test("no part misses a change", async () => {
    const instance = menu({ id: "m" })
    const { api } = instance
    const highlight = (key: string | null) => () =>
      api.internal.highlight(key, { focus: false })
    const press = (slot: string, props: Record<string, unknown>) => () =>
      partPress((instance as PrimitiveInstance).part(slot, props))?.()
    const unbind: Record<string, () => void> = {}
    const heard = await expectNoMissedUpdates(instance, parts, [
      ["open", () => api.open()],
      ["highlight an item", highlight("new")],
      ["highlight another item", highlight("save")],
      ["highlight a checkbox item", highlight("sidebar")],
      ["highlight a radio item", highlight("sort:name")],
      ["highlight the same value in another group", highlight("order:name")],
      ["highlight a key no part has", highlight("gone")],
      ["highlight nothing", highlight(null)],
      ["highlight an item from nothing", highlight("new")],
      ["toggle a checkbox item", press("checkbox-item", { value: "sidebar" })],
      ["toggle it back", press("checkbox-item", { value: "sidebar" })],
      [
        "toggle an item checked by default",
        press("checkbox-item", { value: "statusbar", defaultChecked: true }),
      ],
      [
        "toggle a controlled item",
        press("checkbox-item", { value: "minimap", checked: true }),
      ],
      [
        "an item mounts",
        () =>
          (unbind.rulers = bind(
            instance.part("checkbox-item", { value: "rulers" }),
            fakeElement(1)
          )),
      ],
      [
        "toggle the item that mounted",
        press("checkbox-item", { value: "rulers" }),
      ],
      ["it unmounts", () => unbind.rulers()],
      [
        "choose a radio item",
        press("radio-item", { group: "sort", value: "date" }),
      ],
      [
        "choose in another group",
        press("radio-item", { group: "order", value: "name" }),
      ],
      [
        "choose in a controlled group",
        press("radio-item", { group: "theme", value: "light" }),
      ],
      ["close", () => api.close()],
    ])
    // A toggle reaches the item and its indicator, and no other part.
    expect(heard["toggle a checkbox item"]).toBe(2)
    expect(heard["toggle the item that mounted"]).toBe(1)
    // The group, and the items and indicators of the two values.
    expect(heard["choose a radio item"]).toBe(5)
    // Items select on the highlight, so moving it between two of them reaches
    // those two and the parts that don't select on it.
    const items = parts.filter((part) =>
      ["item", "checkbox-item", "radio-item"].includes(part.slot)
    )
    expect(heard["highlight another item"]).toBe(
      parts.length - items.length + 2
    )
  })
})

// The lists built on the listbox engine. Their items select on the highlight.
const fruits = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
]
const itemParts = (
  props: (value: string) => Record<string, unknown> = (value) => ({ value })
) =>
  fruits.map((fruit) => ({
    slot: "item",
    props: { ...props(fruit.value), disabled: fruit.disabled },
  }))

// Moves the highlight through every kind of change.
function highlightSteps(engine: {
  highlight: (key: string | null, options?: { focus?: boolean }) => void
}) {
  const highlight = (key: string | null) => () =>
    engine.highlight(key, { focus: false })
  return [
    ["highlight an item", highlight("apple")],
    ["highlight another item", highlight("banana")],
    ["highlight a disabled item", highlight("cherry")],
    ["highlight a key no item has", highlight("gone")],
    ["highlight nothing", highlight(null)],
    ["highlight an item from nothing", highlight("apple")],
  ] satisfies Step[]
}

describe("listbox items select on the highlight", () => {
  test("select", async () => {
    const instance = select({ id: "s", items: fruits })
    const { api } = instance
    const heard = await expectNoMissedUpdates(
      instance,
      [{ slot: "trigger", props: {} }, ...itemParts()],
      [
        ["open", () => api.setOpen(true)],
        ...highlightSteps(api.internal.listbox),
        ["choose a value", () => api.setValue("banana")],
        ["close", () => api.setOpen(false)],
      ]
    )
    expect(heard["highlight another item"]).toBe(3)
  })

  test("combobox", async () => {
    const instance = combobox({ id: "c", items: fruits })
    const { api } = instance
    const heard = await expectNoMissedUpdates(
      instance,
      [{ slot: "input", props: {} }, ...itemParts()],
      [
        ["open", () => api.setOpen(true)],
        ...highlightSteps(api.internal.listbox),
        ["choose a value", () => api.setValue("banana")],
        ["close", () => api.setOpen(false)],
      ]
    )
    expect(heard["highlight another item"]).toBe(3)
  })

  test("autocomplete", async () => {
    const instance = autocomplete({ id: "a", items: fruits })
    const { api } = instance
    const heard = await expectNoMissedUpdates(
      instance,
      [{ slot: "input", props: {} }, ...itemParts()],
      [
        ["open", () => api.setOpen(true)],
        ...highlightSteps(api.internal.listbox),
        ["type", () => api.setValue("b")],
        ["close", () => api.setOpen(false)],
      ]
    )
    expect(heard["highlight another item"]).toBe(3)
  })

  test("command", async () => {
    const instance = command({ id: "c", items: fruits })
    const { api } = instance
    const heard = await expectNoMissedUpdates(
      instance,
      [{ slot: "input", props: {} }, ...itemParts()],
      [
        ...highlightSteps(api.internal.listbox),
        ["choose a value", () => api.setValue("banana")],
        ["type", () => api.setQuery("ch")],
      ]
    )
    expect(heard["highlight another item"]).toBe(3)
  })

  test("trigger menu", async () => {
    const instance = triggerMenu({
      id: "t",
      triggers: [{ char: "@", items: fruits }],
    })
    const { api } = instance
    const heard = await expectNoMissedUpdates(
      instance,
      [{ slot: "content", props: {} }, ...itemParts()],
      [
        ["open", () => api.setOpen(true)],
        ...highlightSteps(api.internal.listbox),
        ["close", () => api.setOpen(false)],
      ]
    )
    expect(heard["highlight another item"]).toBe(3)
  })

  test("listbox, whose items also select on the tab stop", async () => {
    const instance = listbox({ id: "l", items: fruits })
    const { api } = instance
    const heard = await expectNoMissedUpdates(
      instance,
      [{ slot: "root", props: {} }, ...itemParts()],
      [
        ...highlightSteps(api.internal.listbox),
        ["focus an item", () => api.internal.focused("banana")],
        ["focus another item", () => api.internal.focused("apple")],
        ["choose a value", () => api.setValue("banana")],
        ["clear the value", () => api.clear()],
      ]
    )
    expect(heard["highlight another item"]).toBe(3)
  })
})

// Options hear only what they show: the highlight and their own entry in the
// listing, which says whether the query hides them and whether they're
// selected. The parts below are options only, so `heard` counts options.
describe("listbox items hear only the options they change", () => {
  const produce = [
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
    { value: "grape", label: "Grape", disabled: true },
  ]
  const composedParts = (extra: Record<string, unknown> = {}) =>
    [...produce, { value: "mango", label: "Mango" }].map((item) => ({
      slot: "item",
      props: { ...item, ...extra },
    }))
  // Registers an item the way a mounted one does.
  const mount = (listbox: Listbox) => () =>
    produce.forEach((item, index) =>
      listbox.register(item.value, fakeElement(index), () => item)
    )
  // A step that mounts mango and types in the same turn, before the list's
  // microtask learns mango mounted.
  const mountWhileTyping = (listbox: Listbox, type: () => unknown) => () => {
    listbox.register("mango", fakeElement(3), () => ({
      value: "mango",
      label: "Mango",
    }))
    type()
  }
  // "a" is in every label, "an" only in Banana and Mango, "p" in Apple and Grape.
  function typingSteps(setQuery: (query: string) => unknown) {
    return [
      ["type what every item matches", () => setQuery("a")],
      ["type what hides two items", () => setQuery("an")],
      ["type what shows them and hides the third", () => setQuery("p")],
      ["empty the text", () => setQuery("")],
    ] satisfies Step[]
  }

  test("select", async () => {
    const instance = select({ id: "s" })
    const { api } = instance
    const heard = await expectNoMissedUpdates(instance, composedParts(), [
      ["mount the items", mount(api.internal.listbox)],
      ["open", () => api.setOpen(true)],
      [
        "the search field binds",
        () => api.internal.store.set({ searchable: true }),
      ],
      ...highlightSteps(api.internal.listbox),
      ...typingSteps(api.setQuery),
      ["choose a value", () => api.setValue("banana")],
      ["choose another", () => api.setValue("apple")],
      [
        "an item mounts while the text changes",
        mountWhileTyping(api.internal.listbox, () => api.setQuery("e")),
      ],
      ["close", () => api.setOpen(false)],
    ])
    expect(heard["open"]).toBe(0)
    expect(heard["type what every item matches"]).toBe(0)
    // Apple and Grape hide, and the highlight moves from Apple to Banana.
    expect(heard["type what hides two items"]).toBe(3)
    expect(heard["type what shows them and hides the third"]).toBe(4)
    expect(heard["choose a value"]).toBe(1)
    expect(heard["choose another"]).toBe(2)
  })

  test("select with multiple", async () => {
    const instance = select({ id: "s", multiple: true })
    const { api } = instance
    const heard = await expectNoMissedUpdates(instance, composedParts(), [
      ["mount the items", mount(api.internal.listbox)],
      ["open", () => api.setOpen(true)],
      ["choose an item", () => api.internal.choose("apple")],
      ["choose another", () => api.internal.choose("banana")],
      ["unchoose the first", () => api.internal.choose("apple")],
      ["clear", () => api.clear()],
    ])
    expect(heard["choose another"]).toBe(1)
    expect(heard["unchoose the first"]).toBe(1)
  })

  test("select with data items placed by index, which show the list's size", async () => {
    const instance = select({ id: "s", items: produce })
    const { api } = instance
    const parts = produce.map((item, index) => ({
      slot: "item",
      props: { value: item.value, label: item.label, index },
    }))
    const heard = await expectNoMissedUpdates(instance, parts, [
      [
        "mount the items",
        () =>
          parts.forEach(({ props }, index) =>
            api.internal.listbox.register(
              props.value,
              fakeElement(index),
              () => props
            )
          ),
      ],
      ["open", () => api.setOpen(true)],
      [
        "the search field binds",
        () => api.internal.store.set({ searchable: true }),
      ],
      ...typingSteps(api.setQuery),
    ])
    // The highlight moves to the first match.
    expect(heard["type what every item matches"]).toBe(1)
    // Every entry's size changes, from 3 to 1.
    expect(heard["type what hides two items"]).toBe(3)
  })

  test("a data list doesn't list its items again as rows scroll in and out", async () => {
    const instance = select({ id: "s", items: produce })
    const { api } = instance
    const row = (index: number) => {
      const props = { ...produce[index], index }
      api.internal.listbox.matches(props.value, props)
      return api.internal.listbox.register(
        props.value,
        fakeElement(index),
        () => props
      )
    }
    const leave = row(0)
    row(1)
    api.setOpen(true)
    await Promise.resolve()
    const listing = vi.spyOn(api.internal.listbox, "listing")
    // A row seen for the first time, with a label the list hadn't learned, and one leaving.
    row(2)
    leave()
    await Promise.resolve()
    expect(listing).not.toHaveBeenCalled()
    api.setValue("banana")
    expect(listing).toHaveBeenCalledTimes(1)
  })

  test("combobox, whose items also show a full selection", async () => {
    const instance = combobox({ id: "c", multiple: true, maxSelected: 2 })
    const { api } = instance
    const heard = await expectNoMissedUpdates(instance, composedParts(), [
      ["mount the items", mount(api.internal.listbox)],
      ["open", () => api.setOpen(true)],
      ...highlightSteps(api.internal.listbox),
      ...typingSteps(api.setQuery),
      ["choose an item", () => api.internal.choose("apple")],
      [
        "choose a second, which fills the selection",
        () => api.internal.choose("banana"),
      ],
      ["unchoose one", () => api.internal.choose("apple")],
      [
        "an item mounts while the text changes",
        mountWhileTyping(api.internal.listbox, () => api.setQuery("e")),
      ],
      ["close", () => api.setOpen(false)],
    ])
    expect(heard["open"]).toBe(0)
    expect(heard["type what every item matches"]).toBe(0)
    // Apple and Grape hide, and Apple loses the highlight.
    expect(heard["type what hides two items"]).toBe(2)
    expect(heard["choose an item"]).toBe(1)
    // Banana, and Grape and Mango, which the full selection blocks.
    expect(heard["choose a second, which fills the selection"]).toBe(3)
    expect(heard["unchoose one"]).toBe(3)
  })

  test("autocomplete", async () => {
    const instance = autocomplete({ id: "a" })
    const { api } = instance
    const heard = await expectNoMissedUpdates(instance, composedParts(), [
      ["mount the items", mount(api.internal.listbox)],
      ["open", () => api.setOpen(true)],
      ...highlightSteps(api.internal.listbox),
      ...typingSteps(api.setValue),
      [
        "an item mounts while the text changes",
        mountWhileTyping(api.internal.listbox, () => api.setValue("e")),
      ],
      ["close", () => api.setOpen(false)],
    ])
    expect(heard["open"]).toBe(0)
    expect(heard["type what every item matches"]).toBe(0)
    // Apple and Grape hide, and Apple loses the highlight.
    expect(heard["type what hides two items"]).toBe(2)
  })

  test("command, whose items also show whether they're running", async () => {
    let finish = () => {}
    const instance = command({
      id: "c",
      onAction: () => new Promise<void>((resolve) => (finish = resolve)),
    })
    const { api } = instance
    const banana = composedParts()[1].props
    const heard = await expectNoMissedUpdates(instance, composedParts(), [
      ["mount the items", mount(api.internal.listbox)],
      ...highlightSteps(api.internal.listbox),
      ...typingSteps(api.setQuery),
      [
        "run a command whose action returns a Promise",
        () => partPress(instance.part("item", banana))?.(),
      ],
      ["the action finishes", () => finish()],
      ["the Promise settles", () => {}],
      [
        "an item mounts while the text changes",
        mountWhileTyping(api.internal.listbox, () => api.setQuery("e")),
      ],
    ])
    expect(heard["type what every item matches"]).toBe(0)
    expect(heard["type what hides two items"]).toBe(2)
    expect(heard["run a command whose action returns a Promise"]).toBe(1)
  })

  test("trigger menu", async () => {
    const editor = fakeEditor()
    const instance = kept(
      triggerMenu({ id: "t", triggers: [{ char: "@" }], editor })
    )
    const { api } = instance
    const heard = await expectNoMissedUpdates(instance, composedParts(), [
      ["mount the items", mount(api.internal.listbox)],
      ["type the trigger", () => editor.type("@")],
      ...highlightSteps(api.internal.listbox),
      ["type what every item matches", () => editor.type("a")],
      ["type what hides two items", () => editor.type("n")],
      ["delete a letter", () => editor.backspace()],
    ])
    expect(heard["type what every item matches"]).toBe(0)
    // Apple and Grape hide, and the highlight moves from Apple to Banana.
    expect(heard["type what hides two items"]).toBe(3)
  })
})

// Roving groups: one tab stop, held by the item that's selected or focused
// last, or before any binds, claimed by the first eligible item.
describe("roving items select on the tab stop", () => {
  test("tabs select on the selected tab too", async () => {
    const instance = tabs({ id: "t" })
    const { api } = instance
    const tab = (value: string, disabled = false) => ({
      slot: "tab",
      props: { value, disabled },
    })
    const panel = (value: string) => ({ slot: "panel", props: { value } })
    const tabParts = [tab("a"), tab("b", true), tab("c"), tab("d")]
    const unbind: (() => void)[] = []
    const unmount = new Map<string, () => void>()
    const heard = await expectNoMissedUpdates(
      instance,
      [
        { slot: "list", props: {} },
        ...tabParts,
        ...["a", "b", "c", "d"].map(panel),
      ],
      [
        // Before any binds, the selected tab holds the stop, and with none
        // selected, the first enabled one claims it.
        ["select a tab before the tabs bind", () => api.select("c")],
        ["select nothing before the tabs bind", () => api.select(null)],
        [
          "bind the tabs",
          () =>
            tabParts.forEach((part, index) =>
              unbind.push(
                bind(instance.part("tab", part.props), fakeElement(index))
              )
            ),
        ],
        [
          "mount the panels",
          () =>
            ["a", "b", "c", "d"].forEach((key) =>
              unmount.set(key, api.internal.registerPanel(key))
            ),
        ],
        ["select a tab", () => api.select("c")],
        ["select the next tab", () => api.select("d")],
        ["a panel finishes leaving", () => api.internal.finishExit("c")],
        // Tabs point only at panels in the page, and a panel that leaves stops exiting.
        ["a panel leaves the page", () => unmount.get("b")!()],
        [
          "it comes back",
          () => unmount.set("b", api.internal.registerPanel("b")),
        ],
        [
          "a panel leaves while it exits",
          () => (api.select("a"), unmount.get("d")!()),
        ],
        ["select nothing", () => api.select(null)],
        ["select a tab from nothing", () => api.select("a")],
        ["select a tab no part has", () => api.select("gone")],
        ["unbind a tab", () => unbind[3]()],
      ]
    )
    // The list, the two tabs and their two panels, since the one left behind
    // starts exiting. Other tabs and panels hear nothing.
    expect(heard["select the next tab"]).toBe(5)
    // The panel's own tab, which stops pointing at it, and the list, which
    // selects on nothing.
    expect(heard["a panel leaves the page"]).toBe(2)
  })

  test("radio items select on the checked value too", async () => {
    const instance = radioGroup({ id: "r" })
    const { api } = instance
    const values = ["a", "b", "c"]
    const unregister: (() => void)[] = []
    const heard = await expectNoMissedUpdates(
      instance,
      [
        { slot: "group", props: {} },
        ...values.map((value) => ({
          slot: "root",
          props: { value, disabled: value === "b" },
        })),
        ...values.map((value) => ({ slot: "indicator", props: { value } })),
      ],
      [
        ["check before items bind", () => api.setValue("c")],
        [
          "bind the items",
          () =>
            values.forEach((value, index) =>
              unregister.push(
                api.internal.roving.bind(
                  fakeElement(index),
                  instance.part("root", { value, disabled: value === "b" })
                )
              )
            ),
        ],
        [
          "bind the indicators",
          () =>
            values.forEach((value, index) =>
              bind(
                instance.part("indicator", { value }),
                animatingElement(index + 3)
              )
            ),
        ],
        // The indicator left behind exits until its animation finishes.
        ["check another item", () => api.setValue("a")],
        [
          "the old indicator finishes leaving",
          () => api.internal.finishExit("c"),
        ],
        ["check nothing", () => api.setValue(null)],
        ["check an item from nothing", () => api.setValue("c")],
        // Disabled radios can't take focus, so the tab stop is gone.
        [
          "disable the group",
          () => instance.setOptions({ id: "r", disabled: true }),
          () => expect(instance.get().stop).toBe(null),
        ],
        [
          "enable the group",
          () => instance.setOptions({ id: "r", disabled: false }),
        ],
        ["unbind an item", () => unregister[2]()],
      ]
    )
    // The group, and the items and indicators of the two values.
    expect(heard["check another item"]).toBe(5)
    // The indicator that left, and the group, which selects on nothing.
    expect(heard["the old indicator finishes leaving"]).toBe(2)
  })

  test("toolbar items, which select on their element's kind too", async () => {
    const instance = toolbar({ id: "t" })
    const { api } = instance
    const parts = [
      { slot: "button", props: { value: "a" } },
      { slot: "button", props: { value: "b", disabled: true } },
      { slot: "input", props: { value: "c" } },
      { slot: "link", props: { id: "d" } },
    ]
    // A button rendered as another element, like a link or a div.
    const rendered = (index: number, link: boolean) =>
      Object.assign(fakeElement(index, link ? "A" : "DIV"), {
        matches: () => link,
      })
    const leave: (() => void)[] = []
    const els = parts.map((_, index) => fakeElement(index))
    const heard = await expectNoMissedUpdates(
      instance,
      [
        { slot: "root", props: {} },
        { slot: "group", props: { id: "g" } },
        { slot: "separator", props: { id: "s" } },
        ...parts,
      ],
      [
        [
          "join the items",
          () =>
            parts.forEach((part, index) => {
              const item = (instance as PrimitiveInstance).part(
                part.slot,
                part.props
              )
              attrs(item)
              leave.push(api.internal.join(item, els[index]))
            }),
        ],
        ["focus an item", () => els[2].focus()],
        ["focus another item", () => els[3].focus()],
        [
          "a button renders as a div",
          () => api.internal.setElement("a", rendered(0, false)),
        ],
        [
          "another renders as a link",
          () => api.internal.setElement("b", rendered(1, true)),
        ],
        [
          "the first renders as a link",
          () => api.internal.setElement("a", rendered(0, true)),
        ],
        [
          "it renders as a button again",
          () => api.internal.setElement("a", fakeElement(0)),
        ],
        [
          "disable the toolbar",
          () => instance.setOptions({ id: "t", disabled: true }),
        ],
        [
          "enable the toolbar",
          () => instance.setOptions({ id: "t", disabled: false }),
        ],
        ["an item leaves", () => leave[3]()],
      ]
    )
    // The root, the group and the separator, which hear every stop move, and
    // the items that lose and take the stop.
    expect(heard["focus another item"]).toBe(5)
    // The button whose element changed, and the root, the group and the
    // separator, which hear every change. Other items hear nothing.
    expect(heard["a button renders as a div"]).toBe(4)
  })

  test("toolbar items that can't keep focus while disabled", async () => {
    const instance = toolbar({ id: "t" })
    const { api } = instance
    const parts = ["a", "b", "c"].map((value) => ({
      slot: "button",
      props: { value, focusableWhenDisabled: false },
    }))
    const els = parts.map((_, index) => fakeElement(index))
    await expectNoMissedUpdates(
      instance,
      [{ slot: "root", props: {} }, ...parts],
      [
        [
          "join the items",
          () =>
            parts.forEach((part, index) => {
              const item = (instance as PrimitiveInstance).part(
                part.slot,
                part.props
              )
              attrs(item)
              api.internal.join(item, els[index])
            }),
        ],
        ["focus an item", () => els[1].focus()],
        // A disabled toolbar leaves no item to focus, so the tab stop is gone.
        [
          "every item becomes unfocusable",
          () => instance.setOptions({ id: "t", disabled: true }),
          () => expect(instance.get().stop).toBe(null),
        ],
        [
          "they come back",
          () => instance.setOptions({ id: "t", disabled: false }),
          () => expect(instance.get().stop).toBe("b"),
        ],
      ]
    )
  })

  test("timeline items, whose inner parts hear none of it", async () => {
    const instance = timeline({ id: "c" })
    const values = ["a", "b", "c"]
    const items = values.map((value) => ({
      slot: "item",
      props: {
        value,
        status: value === "c" ? ("current" as const) : undefined,
      },
    }))
    const inner = values.flatMap((value) =>
      (["marker", "connector", "time", "title", "description"] as const).map(
        (slot) => ({
          slot,
          props: { value },
        })
      )
    )
    const els = values.map((_, index) => fakeElement(index, "LI"))
    const unbind: (() => void)[] = []
    const heard = await expectNoMissedUpdates(
      instance,
      [{ slot: "root", props: {} }, ...items, ...inner],
      [
        [
          "bind the items",
          () =>
            items.forEach((part, index) =>
              unbind.push(bind(instance.part("item", part.props), els[index]))
            ),
        ],
        [
          "bind the titles, times and descriptions",
          () =>
            inner
              .filter(({ slot }) => !["marker", "connector"].includes(slot))
              .forEach((part, index) =>
                unbind.push(
                  bind(
                    instance.part(part.slot, part.props),
                    fakeElement(10 + index, "DIV")
                  )
                )
              ),
        ],
        ["focus an item", () => els[0].focus()],
        ["focus another item", () => els[1].focus()],
        ["become a feed", () => instance.setOptions({ id: "c", feed: true })],
        ["focus an article", () => els[2].focus()],
        ["an item leaves", () => unbind[2]()],
      ]
    )
    // The two items the stop moves between. Nothing else hears it.
    expect(heard["focus another item"]).toBe(2)
    expect(heard["focus an article"]).toBe(2)
  })
})

// Toggles in a toolbar or group aren't parts of its instance, so they follow
// the group's stop through `follow` instead of `selects`.
describe("toggles follow only the stop moves that reach them", () => {
  test("in a toolbar", async () => {
    const bar = toolbar({ id: "t" })
    const { scope } = bar.api.internal
    let heard = 0
    // Counts every time a toggle hears the toolbar.
    const counted = {
      ...scope,
      follow: (key: string, listener: () => void) =>
        scope.follow(key, () => (heard++, listener())),
    }
    const keys = ["a", "b", "c", "d"]
    const toggles = keys.map((id) => toggle({ id, toolbar: () => counted }))
    const els = keys.map((_, index) => fakeElement(index))
    toggles.forEach((instance, index) => instance.api.internal.join(els[index]))
    await Promise.resolve()
    const stops = () =>
      toggles.map((instance) => attrs(instance.part("root")).tabindex)
    expect(stops()).toEqual(["0", "-1", "-1", "-1"])
    heard = 0
    els[2].focus()
    expect(stops()).toEqual(["-1", "-1", "0", "-1"])
    // The toggle that loses the stop and the one that takes it.
    expect(heard).toBe(2)
    heard = 0
    bar.setOptions({ id: "t", disabled: true })
    // Disabling the toolbar reaches every toggle.
    expect(heard).toBe(4)
  })

  test("the toggle that claimed the stop gives it up when the first check moves it", async () => {
    const owner = toggleGroup({ id: "g" })
    const toggles = ["a", "b", "c"].map((value) =>
      toggle({ id: value, value, group: () => owner.api })
    )
    const stops = () =>
      toggles.map((instance) => attrs(instance.part("root")).tabindex)
    // Before anything binds, the first toggle claims the stop.
    expect(stops()).toEqual(["0", "-1", "-1"])
    // With the last one pressed, the first check moves the stop from null to it.
    owner.api.setValue(["c"])
    toggles.forEach((instance, index) =>
      instance.api.internal.join(fakeElement(index))
    )
    await Promise.resolve()
    expect(stops()).toEqual(["-1", "-1", "0"])
  })
})

describe("accordion parts select on their own item", () => {
  test("no part misses a change", async () => {
    const instance = accordion({ id: "a" })
    const { api } = instance
    const values = ["a", "b", "c"]
    const unbind: (() => void)[] = []
    const unmount = new Map<string, () => void>()
    const heard = await expectNoMissedUpdates(
      instance,
      [
        { slot: "root", props: {} },
        ...values.flatMap((value) =>
          ["item", "header", "trigger", "panel"].map((slot) => ({
            slot,
            props: { value },
          }))
        ),
      ],
      [
        ["open an item before the items bind", () => api.open("c")],
        [
          "bind the items",
          () =>
            values.forEach((value, index) =>
              unbind.push(
                bind(instance.part("item", { value }), fakeElement(index))
              )
            ),
        ],
        [
          "mount the panels",
          () =>
            values.forEach((value) =>
              unmount.set(value, api.internal.registerPanel(value))
            ),
        ],
        // The panel left behind exits until its animation finishes.
        ["open another item", () => api.open("a")],
        ["the old panel finishes leaving", () => api.internal.finishExit("c")],
        ["close it", () => api.close("a")],
        // Triggers point only at panels in the page, and a panel that leaves stops exiting.
        ["a panel leaves the page", () => unmount.get("b")!()],
        [
          "it comes back",
          () => unmount.set("b", api.internal.registerPanel("b")),
        ],
        [
          "a panel leaves while it exits",
          () => (api.open("b"), api.close("b"), unmount.get("b")!()),
        ],
        [
          "open several",
          () => (
            instance.setOptions({ id: "a", multiple: true }),
            api.openAll()
          ),
        ],
        ["close them all", () => api.closeAll()],
        ["open an item no part has", () => api.open("gone")],
        [
          "disable the accordion",
          () =>
            instance.setOptions({ id: "a", multiple: true, disabled: true }),
        ],
        ["unbind an item", () => unbind[0]()],
      ]
    )
    // The root, which shows the value, and the four parts of the item that
    // opens and of the one that closes.
    expect(heard["open another item"]).toBe(9)
  })
})

describe("grid cells read the active cell and the range by name", () => {
  const cells: Part[] = []
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      cells.push({ slot: "cell", props: { id: `${row}:${col}`, row, col } })
    }
    cells.push({ slot: "rowHeader", props: { id: `row ${row}`, row } })
  }

  test("no cell misses a change", async () => {
    const instance = sheet({
      id: "s",
      rows: 5,
      cols: 4,
      disabled: (cell) => cell.row === 0 && cell.col === 0,
    })
    const { grid, range, store } = instance.api
    const select = (anchor: GridCell, end: GridCell) => () =>
      range.select({ anchor, end })
    const heard = await expectNoMissedUpdates(instance, cells, [
      ["enter the grid", () => grid.focus({ row: 1, col: 1 })],
      ["move a cell", () => grid.focus({ row: 1, col: 2 })],
      ["grow a range", select({ row: 1, col: 2 }, { row: 2, col: 2 })],
      ["grow it again", select({ row: 1, col: 2 }, { row: 3, col: 3 })],
      ["shrink it", select({ row: 1, col: 2 }, { row: 2, col: 3 })],
      ["swap its corners", select({ row: 2, col: 3 }, { row: 1, col: 2 })],
      [
        "move it so it overlaps",
        select({ row: 2, col: 1 }, { row: 4, col: 3 }),
      ],
      [
        "move it clear of itself",
        select({ row: 0, col: 0 }, { row: 1, col: 0 }),
      ],
      ["select rows", () => range.selectRows(1, 2)],
      ["select columns", () => range.selectColumns(3)],
      ["select every cell", () => range.selectAll()],
      ["drop the range", () => range.select(null)],
      [
        "select a range away from the active cell",
        select({ row: 3, col: 0 }, { row: 4, col: 1 }),
      ],
      [
        "move the active cell, which keeps the range",
        () => grid.focus({ row: 4, col: 3 }),
      ],
      ["leave the grid", () => store.set({ active: null, range: null })],
      ["enter it again", () => grid.focus({ row: 4, col: 0 })],
    ])
    // The two cells, and the header of the row they share.
    expect(heard["move a cell"]).toBe(3)
    // The cell that joins the range, and the one it grows from, which loses its bottom edge.
    expect(heard["grow a range"]).toBe(2)
  })
})
