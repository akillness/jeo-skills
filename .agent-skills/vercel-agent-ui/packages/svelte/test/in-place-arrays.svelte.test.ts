// Svelte tracks a `$state` array changed in place, like `selected.push("b")`,
// so a component given it follows, in what it shows and in what its form
// submits, through `bind:value` and a plain `value` alike.
import { flushSync, mount, unmount, type ComponentProps } from "svelte"
import { afterEach, describe, expect, test } from "vitest"
import App from "./apps/in-place-arrays-app.svelte"

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

type Props = ComponentProps<typeof App>

function render<Initial extends Props>(initial: Initial) {
  const target = document.body.appendChild(document.createElement("div"))
  const props = $state(initial)
  const app = mount(App, { target, props })
  cleanup = () => {
    unmount(app)
    target.remove()
  }
  flushSync()
  return { form: target.querySelector("form")!, props }
}

const labelsWhere = (el: HTMLElement, selector: string, attribute: string) =>
  [...el.querySelectorAll(selector)]
    .filter((item) => item.getAttribute(attribute) === "true")
    .map((item) => item.textContent || item.getAttribute("aria-label"))

const labelsIn = (el: HTMLElement, selector: string) =>
  el.querySelector(selector)!.textContent!.split(", ").filter(Boolean)

// `shownReversed`, for the components that submit in their list's order, is
// what they show once that list of all three is reversed in place.
const components: {
  name: Props["component"]
  shown: (el: HTMLElement) => unknown[]
  submits: boolean
  shownReversed?: string[]
}[] = [
  {
    name: "Listbox",
    shown: (el: HTMLElement) =>
      labelsWhere(el, '[role="option"]', "aria-selected"),
    submits: true,
    // Its options keep their order on the page.
    shownReversed: ["Apple", "Banana", "Cherry"],
  },
  {
    name: "Select",
    shown: (el: HTMLElement) => labelsIn(el, '[data-slot="select-value"]'),
    submits: true,
    shownReversed: ["Cherry", "Banana", "Apple"],
  },
  {
    name: "Combobox",
    shown: (el: HTMLElement) => labelsIn(el, "output"),
    submits: true,
    shownReversed: ["Cherry", "Banana", "Apple"],
  },
  {
    name: "ToggleGroup",
    shown: (el: HTMLElement) => labelsWhere(el, "button", "aria-pressed"),
    submits: false,
  },
  {
    name: "CheckboxGroup",
    shown: (el: HTMLElement) =>
      labelsWhere(el, '[role="checkbox"]', "aria-checked"),
    submits: true,
  },
  {
    name: "Accordion",
    shown: (el: HTMLElement) => labelsWhere(el, "button", "aria-expanded"),
    submits: false,
  },
  {
    name: "Tree",
    shown: (el: HTMLElement) =>
      [...el.querySelectorAll('[role="treeitem"][aria-expanded="true"]')].map(
        (item) => item.querySelector('[data-slot="tree-label"]')!.textContent
      ),
    submits: false,
  },
]

const bindings = [
  { name: "bind:value", bound: true },
  { name: "value", bound: false },
]

describe.each(components)("$name", ({ name, shown, submits }) => {
  test.each(bindings)(
    "follows an item pushed into its $name list",
    ({ bound }) => {
      const { form, props } = render({
        component: name,
        bound,
        selected: ["apple"],
      })
      expect(shown(form)).toEqual(["Apple"])
      props.selected.push("banana")
      flushSync()
      expect(shown(form)).toEqual(["Apple", "Banana"])
      if (submits) {
        expect(new FormData(form).getAll("fruit")).toEqual(["apple", "banana"])
      }
    }
  )

  test.each(bindings)(
    "follows an item spliced out of its $name list",
    ({ bound }) => {
      const { form, props } = render({
        component: name,
        bound,
        selected: ["apple", "banana"],
      })
      expect(shown(form)).toEqual(["Apple", "Banana"])
      props.selected.splice(0, 1)
      flushSync()
      expect(shown(form)).toEqual(["Banana"])
      if (submits) {
        expect(new FormData(form).getAll("fruit")).toEqual(["banana"])
      }
    }
  )

  test.each(bindings)(
    "follows its $name list replaced by an equal one, then pushed into",
    ({ bound }) => {
      const { form, props } = render({
        component: name,
        bound,
        selected: ["apple"],
      })
      props.selected.push("banana")
      flushSync()
      props.selected = [...props.selected]
      flushSync()
      props.selected.push("cherry")
      flushSync()
      expect(shown(form)).toEqual(["Apple", "Banana", "Cherry"])
      if (submits) {
        expect(new FormData(form).getAll("fruit")).toEqual([
          "apple",
          "banana",
          "cherry",
        ])
      }
    }
  )
})

describe.each(components.filter((component) => component.shownReversed))(
  "$name",
  ({ name, shown, shownReversed }) => {
    test.each(bindings)(
      "follows its $name list reordered in place",
      ({ bound }) => {
        const { form, props } = render({
          component: name,
          bound,
          selected: ["apple", "banana", "cherry"],
        })
        props.selected.reverse()
        flushSync()
        expect(shown(form)).toEqual(shownReversed)
        expect(new FormData(form).getAll("fruit")).toEqual([
          "cherry",
          "banana",
          "apple",
        ])
      }
    )
  }
)

test("a Listbox follows a bound list that started empty once it chose into it and the list was pushed into", () => {
  const { form, props } = render({
    component: "Listbox",
    bound: true,
    selected: undefined as string[] | undefined,
  })
  form.querySelector<HTMLElement>('[role="option"]')!.click()
  flushSync()
  expect(props.selected).toEqual(["apple"])
  props.selected?.push("banana")
  flushSync()
  expect(labelsWhere(form, '[role="option"]', "aria-selected")).toEqual([
    "Apple",
    "Banana",
  ])
  expect(new FormData(form).getAll("fruit")).toEqual(["apple", "banana"])
})
