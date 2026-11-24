import { render } from "@solidjs/web"
import { createStore, flush } from "solid-js"
import { afterEach, describe, expect, test } from "vitest"
import { Autocomplete, AutocompleteInput } from "../src/autocomplete"
import { Combobox, ComboboxInput } from "../src/combobox"
import { Command } from "../src/command"
import { Listbox, ListboxItems } from "../src/listbox"
import { Menu, MenuTrigger } from "../src/menu"
import { Select, SelectTrigger } from "../src/select"
import {
  createTriggerMenuController,
  TriggerMenu,
  TriggerMenuInput,
} from "../src/trigger-menu"
import { Tree } from "../src/tree"

let dispose = () => {}

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  dispose = render(code, root)
  flush()
}

afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
  }
  flush()
}

type Row = { value: string; label: string; disabled?: boolean }

const rowNamed = (role: string, name: string) =>
  [...document.querySelectorAll(`[role="${role}"]`)].find(
    (row) => row.textContent === name
  )

// Changes the first row's item in place, the usual Solid store update, so the
// list gets no new array or object, only new values for the fields its rows read.
async function changeFirstItem(role: string, open: (items: Row[]) => void) {
  const [items, setItems] = createStore<Row[]>([
    { value: "a", label: "Alpha", disabled: false },
    { value: "b", label: "Beta" },
  ])
  open(items)
  await settle()
  const row = rowNamed(role, "Alpha")
  expect(row).toBeDefined()
  setItems((draft) => {
    draft[0].label = "Changed"
    draft[0].disabled = true
  })
  await settle()
  expect(rowNamed(role, "Changed")).toBe(row)
  expect(row!.getAttribute("aria-disabled")).toBe("true")
}

const cases: [string, string, (items: Row[]) => any][] = [
  [
    "a data listbox",
    "option",
    (items) => <Listbox aria-label="Letters" items={items} />,
  ],
  [
    "ListboxItems",
    "option",
    (items) => (
      <Listbox aria-label="Letters">
        <ListboxItems items={items} />
      </Listbox>
    ),
  ],
  [
    "a data select",
    "option",
    (items) => (
      <Select items={items} defaultOpen>
        <SelectTrigger />
      </Select>
    ),
  ],
  [
    "a data combobox",
    "option",
    (items) => (
      <Combobox items={items} defaultOpen>
        <ComboboxInput aria-label="Letter" />
      </Combobox>
    ),
  ],
  [
    "a data autocomplete",
    "option",
    (items) => (
      <Autocomplete items={items} defaultOpen>
        <AutocompleteInput aria-label="Letter" />
      </Autocomplete>
    ),
  ],
  ["a data command", "option", (items) => <Command items={items} />],
  [
    "a data menu",
    "menuitem",
    (items) => (
      <Menu items={items} defaultOpen>
        <MenuTrigger>Actions</MenuTrigger>
      </Menu>
    ),
  ],
  [
    "a data tree",
    "treeitem",
    (items) => <Tree aria-label="Letters" items={items} />,
  ],
]

describe("a data list whose store item changes in place", () => {
  for (const [name, role, list] of cases) {
    test(`${name} updates the same row's label and disabled state`, () =>
      changeFirstItem(role, (items) => mount(() => list(items))))
  }

  test("a trigger menu updates the same row's label and disabled state", () =>
    changeFirstItem("option", (items) => {
      const controller = createTriggerMenuController()
      mount(() => (
        <TriggerMenu controller={controller} triggers={[{ char: "@", items }]}>
          <TriggerMenuInput aria-label="Message" />
        </TriggerMenu>
      ))
      document.querySelector("textarea")!.focus()
      controller.open()
    }))
})

// What a keyboard or a press does with a data list must match what its rows
// show, so a change in place reaches the instance too, not only the rows.
describe("a data list changed in place", () => {
  const press = (key: string) =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true })
    )
  const focused = () => document.activeElement?.textContent

  test("a listbox won't select an item disabled in place", async () => {
    const [items, setItems] = createStore<Row[]>([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta", disabled: false },
      { value: "c", label: "Gamma" },
    ])
    const picked: unknown[] = []
    mount(() => (
      <Listbox
        aria-label="Letters"
        items={items}
        onValueChange={(value) => picked.push(value)}
      />
    ))
    await settle()
    setItems((draft) => {
      draft[1].disabled = true
    })
    await settle()
    ;(rowNamed("option", "Beta") as HTMLElement).click()
    await settle()
    expect(picked).toEqual([])
  })

  test("a listbox's End reaches an item pushed in place", async () => {
    const [items, setItems] = createStore<Row[]>([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ])
    mount(() => <Listbox aria-label="Letters" items={items} />)
    await settle()
    setItems((draft) => {
      draft.push({ value: "c", label: "Gamma" })
    })
    await settle()
    rowNamed("option", "Alpha")!.focus()
    press("End")
    await settle()
    expect(focused()).toBe("Gamma")
  })

  test("a listbox's typeahead finds a label changed in place", async () => {
    const [items, setItems] = createStore<Row[]>([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ])
    mount(() => <Listbox aria-label="Letters" items={items} />)
    await settle()
    setItems((draft) => {
      draft[1].label = "Zulu"
    })
    await settle()
    rowNamed("option", "Alpha")!.focus()
    press("z")
    await settle()
    expect(focused()).toBe("Zulu")
  })

  test("a listbox keeps its rows and focus through a change in place", async () => {
    const [items, setItems] = createStore<Row[]>([
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ])
    mount(() => <Listbox aria-label="Letters" items={items} />)
    await settle()
    const row = rowNamed("option", "Beta") as HTMLElement
    row.focus()
    setItems((draft) => {
      draft[0].label = "Changed"
      draft.push({ value: "c", label: "Gamma" })
    })
    await settle()
    expect(rowNamed("option", "Beta")).toBe(row)
    expect(document.activeElement).toBe(row)
  })

  test("a select's value shows a label changed in place", async () => {
    const [items, setItems] = createStore<Row[]>([
      { value: "a", label: "Alpha" },
    ])
    mount(() => (
      <Select items={items} value="a">
        <SelectTrigger />
      </Select>
    ))
    await settle()
    setItems((draft) => {
      draft[0].label = "Changed"
    })
    await settle()
    expect(
      document.querySelector('[data-slot="select-value"]')!.textContent
    ).toBe("Changed")
  })

  test("a combobox filters an item pushed in place", async () => {
    const [items, setItems] = createStore<Row[]>([
      { value: "a", label: "Alpha" },
    ])
    mount(() => (
      <Combobox items={items} defaultOpen>
        <ComboboxInput aria-label="Letter" />
      </Combobox>
    ))
    await settle()
    const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!
    input.value = "Gam"
    input.dispatchEvent(new InputEvent("input", { bubbles: true }))
    await settle()
    setItems((draft) => {
      draft.push({ value: "g", label: "Gamma" })
    })
    await settle()
    expect(
      [...document.querySelectorAll('[role="option"]')].map(
        (row) => row.textContent
      )
    ).toEqual(["Gamma"])
  })

  test("a tree's arrow keys reach a child pushed in place", async () => {
    const [items, setItems] = createStore<
      { value: string; label: string; children?: Row[] }[]
    >([
      { value: "a", label: "Alpha", children: [{ value: "a1", label: "One" }] },
    ])
    mount(() => (
      <Tree aria-label="Letters" items={items} defaultExpanded={["a"]} />
    ))
    await settle()
    setItems((draft) => {
      draft[0].children!.push({ value: "a2", label: "Two" })
    })
    await settle()
    const label = (row: Element | null) =>
      row?.querySelector('[data-slot="tree-label"]')?.textContent
    const one = [
      ...document.querySelectorAll<HTMLElement>('[role="treeitem"]'),
    ].find((row) => label(row) === "One")!
    one.focus()
    press("ArrowDown")
    await settle()
    expect(label(document.activeElement)).toBe("Two")
  })
})
