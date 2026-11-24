// @vitest-environment jsdom
// A component disabled by its option or a fieldset is disabled every way a
// person or an agent reaches it.
import { afterEach, describe, expect, test } from "vitest"
import { isDisabledElement } from "../src/foundation/forms/form"
import { createAgent } from "../src/page/agent/agent"
import { mount } from "../src/testing/mount"
import { componentCases, type ComponentCase } from "./component-cases"

const usable =
  "button, input:not([type=hidden]), select, textarea, [tabindex], [role=button], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=option], [role=menuitem], [role=treeitem], [role=slider], [role=spinbutton], [role=combobox], [role=textbox]"

const ways = [
  {
    way: "its disabled option",
    wrap: (markup: string) => markup,
    options: { disabled: true },
  },
  {
    way: "a disabled fieldset",
    wrap: (markup: string) => `<fieldset disabled>${markup}</fieldset>`,
    options: {},
  },
]

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
})

function mountCase(component: ComponentCase, markup: string, options: object) {
  const mounted = mount(
    component.primitive,
    { ...component.options, ...options },
    markup
  )
  unmount = mounted.unmount
  return mounted
}

const elementsIn = (root: HTMLElement) => [
  root,
  ...root.querySelectorAll<HTMLElement>("[data-slot]"),
]
const partsIn = (root: HTMLElement) =>
  elementsIn(root).filter((el) => el.hasAttribute("data-slot"))

// The parts a person can use while the component is enabled, by their place among its parts.
async function usableParts(component: ComponentCase) {
  const mounted = mountCase(component, component.markup, {})
  await mounted.settle()
  const places = partsIn(mounted.root).flatMap((el, index) =>
    el.matches(usable) && el.getAttribute("aria-hidden") !== "true"
      ? [index]
      : []
  )
  mounted.unmount()
  return places
}

describe.each(ways)("a component disabled by $way", ({ wrap, options }) => {
  describe.each(componentCases)("$name", (component) => {
    test("marks every part a person uses disabled", async () => {
      const places = await usableParts(component)
      expect(places.length).toBeGreaterThan(0)
      const mounted = mountCase(component, wrap(component.markup), options)
      await mounted.settle()
      const parts = partsIn(mounted.root)
      const used = places.map((place) => parts[place])
      const enabled = used
        .filter((el) => !isDisabledElement(el))
        .map((el) => el.dataset.slot)
      expect(enabled).toEqual([])
      const unmarked = used
        .filter((el) => !el.hasAttribute("data-disabled"))
        .map((el) => el.dataset.slot)
      expect(unmarked).toEqual([])
    })

    test("changes nothing when its parts are pressed", async () => {
      const mounted = mountCase(component, wrap(component.markup), options)
      await mounted.settle()
      for (const el of elementsIn(mounted.root)) {
        await mounted.click(el)
      }
      await mounted.settle()
      expect(mounted.changes.map((change) => change.key)).toEqual([])
    })

    test("shows an agent it disabled, with no actions", async () => {
      const mounted = mountCase(component, wrap(component.markup), options)
      await mounted.settle()
      const seen = createAgent()
        .snapshot()
        .filter((entry) => !entry.offPage)
      expect(seen).toHaveLength(1)
      expect(seen[0]).toMatchObject({ disabled: true, actions: [] })
    })
  })
})
