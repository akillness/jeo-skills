import { describe, expect, test } from "vitest"
import type {
  Feature,
  PrimitiveInstance,
} from "../src/foundation/kernel/primitive-types"
import { autocomplete } from "../src/components/autocomplete/autocomplete"
import { combobox } from "../src/components/combobox/combobox"
import { comboboxItemIcons } from "../src/components/combobox/combobox-parts"
import { command } from "../src/components/command/command"
import { menu } from "./menu-parts"
import { navigationMenu } from "../src/components/navigation-menu/navigation-menu"
import { select } from "../src/components/select/select"
import { selectItemIcons } from "../src/components/select/select-parts"
import { tabs } from "../src/components/tabs/tabs"
import { toggle } from "../src/components/toggle/toggle"
import { triggerMenu } from "../src/components/trigger-menu/trigger-menu"
import { attrs, partState, present } from "../src/foundation/kernel/part"

// A select's or combobox's icons ship with the part that renders one, which registers them.
function withIcons<I extends { use: (feature: Feature) => void }>(
  instance: I,
  feature: Feature = selectItemIcons
) {
  instance.use(feature)
  return instance
}

describe("item icons", () => {
  const parts = [
    { instance: menu({ id: "m" }), slot: "item-icon", name: "menu-item-icon" },
    {
      instance: withIcons(select({ id: "s" })),
      slot: "item-icon",
      name: "select-item-icon",
    },
    {
      instance: withIcons(combobox({ id: "c" }), comboboxItemIcons),
      slot: "item-icon",
      name: "combobox-item-icon",
    },
    {
      instance: autocomplete({ id: "a" }),
      slot: "item-icon",
      name: "autocomplete-item-icon",
    },
    {
      instance: command({ id: "k" }),
      slot: "item-icon",
      name: "command-item-icon",
    },
    {
      instance: triggerMenu({ id: "t", triggers: [] }),
      slot: "item-icon",
      name: "trigger-menu-item-icon",
    },
    { instance: tabs({ id: "b" }), slot: "tab-icon", name: "tabs-tab-icon" },
    { instance: toggle({ id: "g" }), slot: "icon", name: "toggle-icon" },
    {
      instance: navigationMenu({ id: "n" }),
      slot: "link-icon",
      name: "navigation-menu-link-icon",
    },
  ] as const

  test.each(parts)(
    "$name is hidden from assistive technology",
    ({ instance, slot, name }) => {
      expect(
        attrs((instance as PrimitiveInstance).part(slot, { id: "i" }))
      ).toEqual({
        "data-slot": name,
        "aria-hidden": "true",
      })
    }
  )

  test.each(parts)(
    "$name says when it flips in right-to-left text",
    ({ instance, slot }) => {
      const icons = instance as PrimitiveInstance
      expect(attrs(icons.part(slot, { id: "i", mirror: true }))).toMatchObject({
        "data-mirror": "",
      })
      expect(partState(icons.part(slot, { id: "i", mirror: true }))).toEqual({
        mirror: true,
      })
      expect(partState(icons.part(slot, { id: "i" }))).toEqual({
        mirror: false,
      })
    }
  )
})

describe("value icons", () => {
  // Stands in for an icon element, which Node doesn't have.
  const icon = (name: string) => ({ name }) as unknown as Element

  test("a select's value icon is present once the selected item's icon is known", async () => {
    const instance = withIcons(select({ id: "s", defaultValue: "apple" }))
    expect(present(instance.part("value-icon", {}))).toBe(false)
    instance.api.internal.icons.register("apple", icon("apple"))
    await Promise.resolve()
    expect(present(instance.part("value-icon", {}))).toBe(true)
    instance.api.setValue("pear")
    expect(present(instance.part("value-icon", {}))).toBe(false)
  })

  test("a combobox shows no value icon while several items are selected", async () => {
    const instance = withIcons(
      combobox({ id: "c", multiple: true, defaultValue: ["apple"] }),
      comboboxItemIcons
    )
    instance.api.internal.icons.register("apple", icon("apple"))
    instance.api.internal.icons.register("pear", icon("pear"))
    await Promise.resolve()
    expect(present(instance.part("value-icon", {}))).toBe(true)
    instance.api.setValue(["apple", "pear"])
    expect(present(instance.part("value-icon", {}))).toBe(false)
  })

  test("an icon stays known after its item leaves, as what `keep` leaves", () => {
    const instance = withIcons(select({ id: "s" }))
    const { icons } = instance.api.internal
    const live = icon("live")
    const copy = icon("copy")
    const unregister = icons.register("apple", live, () => copy)
    expect(icons.get("apple")).toBe(live)
    unregister()
    expect(icons.get("apple")).toBe(copy)
  })
})
