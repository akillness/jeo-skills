// @vitest-environment jsdom
// Vue tracks an array changed in place, like `selected.push("b")` on a
// `reactive` list, so a component bound to it follows, in what it shows and
// in what its form submits, through `v-model` and `v-model:<key>` alike.
import { afterEach, describe, expect, test } from "vitest"
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
} from "vue"
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
import { TokenInput, TokenInputEditor } from "../src/token-input"
import { Tree } from "../src/tree"

Element.prototype.getAnimations ??= () => []

const fruits = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
]

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

function mount(render: () => unknown) {
  const el = document.body.appendChild(document.createElement("form"))
  app = createApp(defineComponent({ setup: () => render }))
  app.mount(el)
  return el
}

const valueModels = [
  { name: "v-model", bind: (selected: string[]) => ({ modelValue: selected }) },
  {
    name: "v-model:value",
    bind: (selected: string[]) => ({ value: selected }),
  },
]

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
    render: (model: object) =>
      h(Listbox, { multiple: true, name: "fruit", items: fruits, ...model }),
    shown: (el: HTMLElement) =>
      labelsWhere(el, '[role="option"]', "aria-selected"),
    submits: true,
    models: valueModels,
    // Its options keep their order on the page.
    shownReversed: ["Apple", "Banana", "Cherry"],
  },
  {
    name: "Select",
    render: (model: object) =>
      h(
        Select,
        { multiple: true, name: "fruit", items: fruits, ...model },
        () => h(SelectTrigger)
      ),
    shown: (el: HTMLElement) => labelsIn(el, '[data-slot="select-value"]'),
    submits: true,
    models: valueModels,
    shownReversed: ["Cherry", "Banana", "Apple"],
  },
  {
    name: "Combobox",
    render: (model: object) =>
      h(
        Combobox,
        { multiple: true, name: "fruit", items: fruits, ...model },
        () => [h("output", null, h(ComboboxValue)), h(ComboboxInput)]
      ),
    shown: (el: HTMLElement) => labelsIn(el, "output"),
    submits: true,
    models: valueModels,
    shownReversed: ["Cherry", "Banana", "Apple"],
  },
  {
    name: "ToggleGroup",
    render: (model: object) =>
      h(ToggleGroup, { multiple: true, ...model }, () =>
        fruits.map((fruit) =>
          h(Toggle, { key: fruit.value, value: fruit.value }, () => fruit.label)
        )
      ),
    shown: (el: HTMLElement) => labelsWhere(el, "button", "aria-pressed"),
    submits: false,
    models: valueModels,
  },
  {
    name: "CheckboxGroup",
    render: (model: object) =>
      h(CheckboxGroup, { name: "fruit", ...model }, () =>
        fruits.map((fruit) =>
          h(Checkbox, {
            key: fruit.value,
            value: fruit.value,
            "aria-label": fruit.label,
          })
        )
      ),
    shown: (el: HTMLElement) =>
      labelsWhere(el, '[role="checkbox"]', "aria-checked"),
    submits: true,
    models: valueModels,
  },
  {
    name: "Accordion",
    render: (model: object) =>
      h(Accordion, { multiple: true, ...model }, () =>
        fruits.map((fruit) =>
          h(AccordionItem, { key: fruit.value, value: fruit.value }, () => [
            h(AccordionHeader, null, () =>
              h(AccordionTrigger, null, () => fruit.label)
            ),
            h(AccordionPanel, null, () => `${fruit.label} panel`),
          ])
        )
      ),
    shown: (el: HTMLElement) => labelsWhere(el, "button", "aria-expanded"),
    submits: false,
    models: valueModels,
  },
  {
    name: "Tree",
    render: (model: object) =>
      h(Tree, {
        "aria-label": "Fruit",
        items: fruits.map((fruit) => ({
          ...fruit,
          children: [{ value: `${fruit.value}-seed`, label: "Seed" }],
        })),
        ...model,
      }),
    shown: (el: HTMLElement) =>
      [...el.querySelectorAll('[role="treeitem"][aria-expanded="true"]')].map(
        (item) => item.querySelector('[data-slot="tree-label"]')!.textContent
      ),
    submits: false,
    models: [
      {
        name: "v-model:expanded",
        bind: (expanded: string[]) => ({ expanded }),
      },
    ],
  },
]

describe.each(components)("$name", ({ render, shown, submits, models }) => {
  test.each(models)(
    "follows an item pushed into its $name list",
    async ({ bind }) => {
      const selected = reactive(["apple"])
      const form = mount(() => render(bind(selected)))
      expect(shown(form)).toEqual(["Apple"])
      selected.push("banana")
      await nextTick()
      expect(shown(form)).toEqual(["Apple", "Banana"])
      if (submits) {
        expect(new FormData(form).getAll("fruit")).toEqual(["apple", "banana"])
      }
    }
  )

  test.each(models)(
    "follows an item spliced out of its $name list",
    async ({ bind }) => {
      const selected = reactive(["apple", "banana"])
      const form = mount(() => render(bind(selected)))
      expect(shown(form)).toEqual(["Apple", "Banana"])
      selected.splice(0, 1)
      await nextTick()
      expect(shown(form)).toEqual(["Banana"])
      if (submits) {
        expect(new FormData(form).getAll("fruit")).toEqual(["banana"])
      }
    }
  )

  test.each(models)(
    "follows its $name list replaced by an equal one, then pushed into",
    async ({ bind }) => {
      const selected = ref(["apple"])
      const form = mount(() => render(bind(selected.value)))
      selected.value.push("banana")
      await nextTick()
      selected.value = [...selected.value]
      await nextTick()
      selected.value.push("cherry")
      await nextTick()
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
  ({ render, shown, models, shownReversed }) => {
    test.each(models)(
      "follows its $name list reordered in place",
      async ({ bind }) => {
        const selected = reactive(["apple", "banana", "cherry"])
        const form = mount(() => render(bind(selected)))
        selected.reverse()
        await nextTick()
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

describe("TokenInput", () => {
  test.each(valueModels)(
    "follows text pushed into its value with $name",
    async ({ bind }) => {
      const value = reactive(["Hello"])
      const form = mount(() =>
        h(TokenInput, { name: "prompt", ...bind(value) }, () =>
          h(TokenInputEditor, { "aria-label": "Prompt" })
        )
      )
      value.push(" world")
      await nextTick()
      expect(form.querySelector('[role="textbox"]')!.textContent).toBe(
        "Hello world"
      )
      expect(new FormData(form).get("prompt")).toBe("Hello world")
    }
  )
})
