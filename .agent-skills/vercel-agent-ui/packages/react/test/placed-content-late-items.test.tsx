// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
} from "../src/autocomplete"
import { Combobox, ComboboxContent, ComboboxInput } from "../src/combobox"
import { Command, CommandInput, CommandList } from "../src/command"
import { Menu, MenuContent, MenuItems, MenuTrigger } from "../src/menu"
import { Select, SelectContent, SelectTrigger } from "../src/select"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []
Element.prototype.scrollIntoView ??= () => {}
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

const settle = () =>
  React.act(() => new Promise((resolve) => setTimeout(resolve, 20)))

const fruit = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
]

type Items = typeof fruit | undefined

const cases: {
  name: string
  render: (items: Items, wrap: boolean) => React.ReactNode
  keys: string
  content: string
}[] = [
  {
    name: "Combobox",
    render: (items, wrap) => {
      const Popup = wrap ? () => <ComboboxContent /> : ComboboxContent
      return (
        <Combobox items={items} defaultOpen>
          <ComboboxInput aria-label="Fruit" />
          <Popup />
        </Combobox>
      )
    },
    keys: '[data-slot="combobox-input"]',
    content: '[data-slot="combobox-content"]',
  },
  {
    name: "Autocomplete",
    render: (items, wrap) => {
      const Popup = wrap ? () => <AutocompleteContent /> : AutocompleteContent
      return (
        <Autocomplete items={items} defaultOpen>
          <AutocompleteInput aria-label="Fruit" />
          <Popup />
        </Autocomplete>
      )
    },
    keys: '[data-slot="autocomplete-input"]',
    content: '[data-slot="autocomplete-content"]',
  },
  {
    name: "Select",
    render: (items, wrap) => {
      const Popup = wrap ? () => <SelectContent /> : SelectContent
      return (
        <Select items={items} defaultOpen>
          <SelectTrigger aria-label="Fruit" />
          <Popup />
        </Select>
      )
    },
    keys: '[data-slot="select-content"]',
    content: '[data-slot="select-content"]',
  },
  {
    name: "Menu",
    render: (items, wrap) => {
      const list = items && <MenuItems items={items} />
      const Popup = () => <MenuContent>{list}</MenuContent>
      return (
        <Menu items={items} defaultOpen>
          <MenuTrigger>Fruit</MenuTrigger>
          {wrap ? <Popup /> : <MenuContent>{list}</MenuContent>}
        </Menu>
      )
    },
    keys: '[data-slot="menu-content"]',
    content: '[data-slot="menu-content"]',
  },
  {
    name: "Command",
    render: (items, wrap) => {
      const List = wrap ? () => <CommandList /> : CommandList
      return (
        <Command items={items}>
          <CommandInput aria-label="Fruit" />
          <List />
        </Command>
      )
    },
    keys: '[data-slot="command-input"]',
    content: '[data-slot="command-list"]',
  },
]

// Placed directly, the content is found in the markup; inside a component of
// your own, it tells its root it's there. Both end the same way.
async function arrowDownAfterLateItems(
  { render, keys, content }: (typeof cases)[number],
  wrap: boolean
) {
  const host = document.body.appendChild(document.createElement("div"))
  root = createRoot(host)
  await React.act(async () => root!.render(render(undefined, wrap)))
  await settle()
  await React.act(async () => root!.render(render(fruit, wrap)))
  await settle()
  const contents = document.querySelectorAll(content).length
  const target = document.querySelector<HTMLElement>(keys)!
  target.focus()
  await React.act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    )
  })
  await settle()
  const highlighted = (
    document.querySelector("[data-highlighted]") ?? document.activeElement
  )?.textContent
  await React.act(async () => root!.unmount())
  root = undefined
  document.body.replaceChildren()
  return { contents, highlighted }
}

for (const entry of cases) {
  test(`${entry.name}: content inside your own component keeps its arrow keys when items arrive after it mounts`, async () => {
    const direct = await arrowDownAfterLateItems(entry, false)
    expect(direct.contents).toBe(1)
    expect(direct.highlighted).toMatch(/^(Apple|Banana)$/)
    expect(await arrowDownAfterLateItems(entry, true)).toEqual(direct)
  })
}

test("Combobox renders its own content when yours leaves as its items arrive", async () => {
  const Popup = () => <ComboboxContent />
  const render = (items: Items) => (
    <Combobox items={items} defaultOpen>
      <ComboboxInput aria-label="Fruit" />
      {!items && <Popup />}
    </Combobox>
  )
  root = createRoot(document.body.appendChild(document.createElement("div")))
  await React.act(async () => root!.render(render(undefined)))
  await settle()
  await React.act(async () => root!.render(render(fruit)))
  await settle()
  expect(
    document.querySelectorAll('[data-slot="combobox-content"]')
  ).toHaveLength(1)
})
