// A Solid store's setter changes an array in place, like
// `setState((draft) => { draft.selected.push("b") })`, so a component given
// that array follows, in what it shows and in what its form submits.
import { createStore, flush } from "solid-js"
import { render, type JSX } from "@solidjs/web"
import { afterEach, describe, expect, test } from "vitest"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "../src/accordion"
import { Checkbox, CheckboxGroup } from "../src/checkbox"
import { Combobox, ComboboxInput, ComboboxValue } from "../src/combobox"
import { Listbox } from "../src/listbox"
import { Select, SelectTrigger } from "../src/select"
import { Toggle, ToggleGroup } from "../src/toggle"
import { Tree } from "../src/tree"

const fruits = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
]

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

function mount(code: () => JSX.Element) {
  const form = document.body.appendChild(document.createElement("form"))
  dispose = render(code, form)
  flush()
  return form
}

const labelsWhere = (el: HTMLElement, selector: string, attribute: string) =>
  [...el.querySelectorAll(selector)]
    .filter((item) => item.getAttribute(attribute) === "true")
    .map((item) => item.textContent || item.getAttribute("aria-label"))

const labelsIn = (el: HTMLElement, selector: string) =>
  el.querySelector(selector)!.textContent!.split(", ").filter(Boolean)

// `shownReversed`, for the components that submit in their list's order, is
// what they show once that list of all three is reversed in place.
const components = [
  {
    name: "Listbox",
    render: (value: () => string[]) => (
      <Listbox multiple name="fruit" items={fruits} value={value()} />
    ),
    shown: (el: HTMLElement) =>
      labelsWhere(el, '[role="option"]', "aria-selected"),
    submits: true,
    // Its options keep their order on the page.
    shownReversed: ["Apple", "Banana", "Cherry"],
  },
  {
    name: "Select",
    render: (value: () => string[]) => (
      <Select multiple name="fruit" items={fruits} value={value()}>
        <SelectTrigger />
      </Select>
    ),
    shown: (el: HTMLElement) => labelsIn(el, '[data-slot="select-value"]'),
    submits: true,
    shownReversed: ["Cherry", "Banana", "Apple"],
  },
  {
    name: "Combobox",
    render: (value: () => string[]) => (
      <Combobox multiple name="fruit" items={fruits} value={value()}>
        <output>
          <ComboboxValue />
        </output>
        <ComboboxInput />
      </Combobox>
    ),
    shown: (el: HTMLElement) => labelsIn(el, "output"),
    submits: true,
    shownReversed: ["Cherry", "Banana", "Apple"],
  },
  {
    name: "ToggleGroup",
    render: (value: () => string[]) => (
      <ToggleGroup multiple value={value()}>
        {fruits.map((fruit) => (
          <Toggle value={fruit.value}>{fruit.label}</Toggle>
        ))}
      </ToggleGroup>
    ),
    shown: (el: HTMLElement) => labelsWhere(el, "button", "aria-pressed"),
    submits: false,
  },
  {
    name: "CheckboxGroup",
    render: (value: () => string[]) => (
      <CheckboxGroup name="fruit" value={value()}>
        {fruits.map((fruit) => (
          <Checkbox value={fruit.value} aria-label={fruit.label} />
        ))}
      </CheckboxGroup>
    ),
    shown: (el: HTMLElement) =>
      labelsWhere(el, '[role="checkbox"]', "aria-checked"),
    submits: true,
  },
  {
    name: "Accordion",
    render: (value: () => string[]) => (
      <Accordion multiple value={value()}>
        {fruits.map((fruit) => (
          <AccordionItem value={fruit.value}>
            <AccordionHeader>
              <AccordionTrigger>{fruit.label}</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>{fruit.label} panel</AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    ),
    shown: (el: HTMLElement) => labelsWhere(el, "button", "aria-expanded"),
    submits: false,
  },
  {
    name: "Tree",
    render: (expanded: () => string[]) => (
      <Tree
        aria-label="Fruit"
        items={fruits.map((fruit) => ({
          ...fruit,
          children: [{ value: `${fruit.value}-seed`, label: "Seed" }],
        }))}
        expanded={expanded()}
      />
    ),
    shown: (el: HTMLElement) =>
      [...el.querySelectorAll('[role="treeitem"][aria-expanded="true"]')].map(
        (item) => item.querySelector('[data-slot="tree-label"]')!.textContent
      ),
    submits: false,
  },
]

describe.each(components)("$name", ({ render, shown, submits }) => {
  test("follows an item pushed into its store list", () => {
    const [state, setState] = createStore({ selected: ["apple"] })
    const form = mount(() => render(() => state.selected))
    expect(shown(form)).toEqual(["Apple"])
    setState((draft) => {
      draft.selected.push("banana")
    })
    flush()
    expect(shown(form)).toEqual(["Apple", "Banana"])
    if (submits) {
      expect(new FormData(form).getAll("fruit")).toEqual(["apple", "banana"])
    }
  })

  test("follows an item spliced out of its store list", () => {
    const [state, setState] = createStore({ selected: ["apple", "banana"] })
    const form = mount(() => render(() => state.selected))
    expect(shown(form)).toEqual(["Apple", "Banana"])
    setState((draft) => {
      draft.selected.splice(0, 1)
    })
    flush()
    expect(shown(form)).toEqual(["Banana"])
    if (submits) {
      expect(new FormData(form).getAll("fruit")).toEqual(["banana"])
    }
  })

  test("follows its store list replaced by an equal one, then pushed into", () => {
    const [state, setState] = createStore({ selected: ["apple"] })
    const form = mount(() => render(() => state.selected))
    setState((draft) => {
      draft.selected.push("banana")
    })
    flush()
    setState((draft) => {
      draft.selected = [...draft.selected]
    })
    flush()
    setState((draft) => {
      draft.selected.push("cherry")
    })
    flush()
    expect(shown(form)).toEqual(["Apple", "Banana", "Cherry"])
    if (submits) {
      expect(new FormData(form).getAll("fruit")).toEqual([
        "apple",
        "banana",
        "cherry",
      ])
    }
  })
})

describe.each(components.filter((component) => component.shownReversed))(
  "$name",
  ({ render, shown, shownReversed }) => {
    test("follows its store list reordered in place", () => {
      const [state, setState] = createStore({
        selected: ["apple", "banana", "cherry"],
      })
      const form = mount(() => render(() => state.selected))
      setState((draft) => {
        draft.selected.reverse()
      })
      flush()
      expect(shown(form)).toEqual(shownReversed)
      expect(new FormData(form).getAll("fruit")).toEqual([
        "cherry",
        "banana",
        "apple",
      ])
    })
  }
)
