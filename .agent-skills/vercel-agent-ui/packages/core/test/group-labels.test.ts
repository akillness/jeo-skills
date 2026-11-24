import { describe, expect, test } from "vitest"
import { combobox } from "../src/components/combobox/combobox"
import { listbox } from "../src/components/listbox/listbox-root"
import { menu } from "./menu-parts"
import { select } from "../src/components/select/select"
import { triggerMenu } from "../src/components/trigger-menu/trigger-menu"
import { fakeElement } from "./selects"
import { attrs, bind } from "../src/foundation/kernel/part"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"

const flush = () =>
  new Promise((resolve) => queueMicrotask(() => resolve(undefined)))

// Groups point `aria-labelledby` at their label only while one is in the page,
// so an unlabeled group never names a missing id.
describe("group labels", () => {
  const lists = [
    ["listbox", () => listbox({ id: "l" })],
    ["select", () => select({ id: "s" })],
    ["combobox", () => combobox({ id: "c" })],
    ["trigger menu", () => triggerMenu({ id: "t", triggers: [] })],
  ] as const

  for (const [name, create] of lists) {
    test(`a ${name} group without a label has no aria-labelledby`, async () => {
      const instance: PrimitiveInstance = create()
      await flush()
      expect(
        attrs(instance.part("group", { id: "fruit" }))["aria-labelledby"]
      ).toBeUndefined()
    })

    test(`a ${name} group is named by its label while the label is in the page`, async () => {
      const instance: PrimitiveInstance = create()
      const unbind = bind(
        instance.part("group-label", { id: "fruit", group: "fruit" }),
        fakeElement(0, "DIV")
      )
      await flush()
      const labelId = attrs(
        instance.part("group-label", { id: "fruit", group: "fruit" })
      ).id
      expect(
        attrs(instance.part("group", { id: "fruit" }))["aria-labelledby"]
      ).toBe(labelId)
      expect(
        attrs(instance.part("group", { id: "herbs" }))["aria-labelledby"]
      ).toBeUndefined()
      unbind()
      await flush()
      expect(
        attrs(instance.part("group", { id: "fruit" }))["aria-labelledby"]
      ).toBeUndefined()
    })
  }

  test("a label bound again before its old cleanup keeps its group named", async () => {
    const instance = listbox({ id: "l" })
    const first = bind(
      instance.part("group-label", { id: "fruit", group: "fruit" }),
      fakeElement(0, "DIV")
    )
    await flush()
    // React's StrictMode binds again, then runs the first cleanup.
    const second = bind(
      instance.part("group-label", { id: "fruit", group: "fruit" }),
      fakeElement(0, "DIV")
    )
    first()
    await flush()
    expect(
      attrs(instance.part("group", { id: "fruit" }))["aria-labelledby"]
    ).toBeDefined()
    second()
    await flush()
    expect(
      attrs(instance.part("group", { id: "fruit" }))["aria-labelledby"]
    ).toBeUndefined()
  })

  test("menu groups and radio groups are named only by a label in the page", async () => {
    const instance = menu({ id: "m" })
    expect(
      attrs(instance.part("group", { id: "view" }))["aria-labelledby"]
    ).toBeUndefined()
    expect(
      attrs(instance.part("radio-group", { name: "sort" }))["aria-labelledby"]
    ).toBeUndefined()
    bind(
      instance.part("group-label", { id: "view", group: "view" }),
      fakeElement(0, "DIV")
    )
    bind(
      instance.part("group-label", { id: "sort", group: "sort" }),
      fakeElement(1, "DIV")
    )
    await flush()
    expect(
      attrs(instance.part("group", { id: "view" }))["aria-labelledby"]
    ).toBe("m-label-view")
    expect(
      attrs(instance.part("radio-group", { name: "sort" }))["aria-labelledby"]
    ).toBe("m-label-sort")
  })

  test("a menu radio group whose name has a space is named by one id", async () => {
    const instance = menu({ id: "m" })
    const label = { id: "sort", group: "sort order" }
    bind(instance.part("group-label", label), fakeElement(0, "DIV"))
    await flush()
    const labelId = attrs(instance.part("group-label", label)).id
    expect(labelId).not.toMatch(/\s/)
    expect(
      attrs(instance.part("radio-group", { name: "sort order" }))[
        "aria-labelledby"
      ]
    ).toBe(labelId)
  })

  test("labels that bind together change the state once", async () => {
    const instance = listbox({ id: "l" })
    let changes = 0
    instance.subscribe(() => changes++)
    for (const [index, group] of ["fruit", "herbs", "nuts"].entries()) {
      bind(
        instance.part("group-label", { id: group, group }),
        fakeElement(index, "DIV")
      )
    }
    await flush()
    expect(changes).toBe(1)
    for (const group of ["fruit", "herbs", "nuts"]) {
      expect(
        attrs(instance.part("group", { id: group }))["aria-labelledby"]
      ).toBeDefined()
    }
  })
})
