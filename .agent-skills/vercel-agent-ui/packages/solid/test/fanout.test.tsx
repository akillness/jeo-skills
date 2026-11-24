import { menu } from "@ui-sdk/core/menu"
import { menuCheckable, press } from "@ui-sdk/core/renderer"
import { render } from "@solidjs/web"
import { flush } from "solid-js"
import { expect, test } from "vitest"
import { budgets } from "../../../tests/perf/budgets"
import { usePart, usePrimitive } from "../src/use-primitive"

// The adapter keeps core's fan-out: a part renders again only when a key it
// read changes, so a highlight move reaches two items whatever the count. A
// part's class function counts its renders: it runs again when a key it read
// changes. Outside the document, so no part binds.
// Same bound at every size, so work that grows with the item count fails at
// the larger ones.
for (const n of [10, 500]) {
  test(`a highlight change renders two items that read it, and none that don't (n=${n})`, async () => {
    const renders = { watched: 0, plain: 0 }
    let instance!: ReturnType<typeof menu>
    const root = document.createElement("div")
    const dispose = render(() => {
      const handle = usePrimitive(menu, () => ({}))
      instance = handle.instance
      return Array.from({ length: n }, (_, i) =>
        usePart(handle, "item", () => ({ value: `item-${i}` }), {
          // Half the items read the highlight, like an item that shows an arrow beside it.
          class:
            i % 2
              ? (state) => (
                  renders.watched++,
                  state.highlighted ? "highlighted" : ""
                )
              : (state) => (renders.plain++, state.disabled ? "disabled" : ""),
        })
      )
    }, root)
    flush()
    instance.api.internal.highlight("item-1", { focus: false })
    flush()
    renders.watched = renders.plain = 0
    for (let step = 0; step < 10; step++) {
      instance.api.internal.highlight(`item-${(3 + step * 2) % n}`, {
        focus: false,
      })
      flush()
    }
    expect(renders.plain).toBe(budgets["menu.arrow-key"].renders.plain)
    expect(renders.watched).toBeLessThanOrEqual(
      budgets["menu.arrow-key"].renders.watched
    )
    dispose()
  })

  test(`a checkbox toggle re-renders its item and its indicator only (n=${n})`, async () => {
    const rendered = new Set<string>()
    let instance!: ReturnType<typeof menu>
    const root = document.createElement("div")
    const dispose = render(() => {
      const handle = usePrimitive(menu, () => ({}))
      instance = handle.instance
      // The checkbox item parts register their feature when they render.
      instance.use(menuCheckable)
      const watch = (slot: string, props: Record<string, unknown>) =>
        usePart(handle, slot as "item", () => props as { value: string }, {
          // Reads every key, like a render function that shows them all.
          class: (state) => {
            for (const key of [
              "checked",
              "highlighted",
              "disabled",
              "open",
              "selected",
            ]) {
              void (state as Record<string, unknown>)[key]
            }
            rendered.add(`${slot} ${JSON.stringify(props)}`)
            return ""
          },
        })
      return [
        ...Array.from({ length: n }, (_, i) =>
          watch("item", { value: `item-${i}` })
        ),
        watch("checkbox-item", { value: "wrap" }),
        watch("item-indicator", {
          id: "wrap-check",
          item: "checkbox-item",
          itemKey: "wrap",
        }),
        watch("checkbox-item", { value: "minimap" }),
        watch("item-indicator", {
          id: "minimap-check",
          item: "checkbox-item",
          itemKey: "minimap",
        }),
      ]
    }, root)
    flush()
    rendered.clear()
    press(instance.part("checkbox-item", { value: "wrap" }))?.()
    flush()
    expect(rendered.size).toBeLessThanOrEqual(budgets["menu.checkbox"].notified)
    expect([...rendered].sort()).toEqual([
      'checkbox-item {"value":"wrap"}',
      'item-indicator {"id":"wrap-check","item":"checkbox-item","itemKey":"wrap"}',
    ])
    dispose()
  })
}
