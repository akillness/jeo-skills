import { partState } from "@ui-sdk/core/renderer"
import {
  waterfall,
  type WaterfallApi,
  type WaterfallAxisState,
  type WaterfallTimeState,
} from "@ui-sdk/core/waterfall"
import type { PrimitiveInstance } from "@ui-sdk/core"
import { createParts } from "./define-element"
import { copy, templateOf } from "./list"

const owner = "ui-waterfall"

// The rows and ticks an element rendered for itself, so a new render replaces them.
const generated = new WeakSet<Element>()
// The items each waterfall rendered its rows from, the ticks each axis shows,
// and the empty ticks that show their time.
const renderedItems = new WeakMap<HTMLElement, unknown>()
const shownTicks = new WeakMap<HTMLElement, string>()
const labeledTicks = new WeakSet<HTMLElement>()

// A row for every span, from a <template> inside the waterfall when it has one.
function renderRows(api: WaterfallApi, template: HTMLTemplateElement | null) {
  return api.internal.all().map((item) => {
    const row = copy(template, "ui-waterfall-row", false)
    row.setAttribute("value", item.value)
    const header = copy(template, "ui-waterfall-row-header", false)
    if (item.children) {
      header.append(copy(template, "ui-waterfall-indicator"))
    }
    header.append(item.label)
    row.append(header, copy(template, "ui-waterfall-bar"))
    generated.add(row)
    return row
  })
}

const own = (el: Element) =>
  Array.from(el.children).some((child) => !generated.has(child))

// Axes left empty show their ticks, and ticks left empty their time, kept in step with the range and the locale.
function renderTicks(el: HTMLElement, instance: PrimitiveInstance) {
  const axes = Array.from(
    el.querySelectorAll<HTMLElement>("ui-waterfall-axis")
  ).filter((axis) => axis.closest(owner) === el && !own(axis))
  for (const axis of axes) {
    const max = Number(axis.getAttribute("max-ticks")) || undefined
    const { ticks } = partState(
      instance.part("axis", { maxTicks: max })
    ) as WaterfallAxisState
    const shown = ticks.map((tick) => `${tick.time}:${tick.label}`).join(",")
    if (shownTicks.get(axis) === shown) {
      continue
    }
    shownTicks.set(axis, shown)
    axis.replaceChildren(
      ...ticks.map((tick) => {
        const child = axis.ownerDocument.createElement("ui-waterfall-tick")
        child.setAttribute("time", String(tick.time))
        child.textContent = tick.label
        generated.add(child)
        return child
      })
    )
  }
  for (const tick of el.querySelectorAll<HTMLElement>("ui-waterfall-tick")) {
    if (
      tick.closest(owner) !== el ||
      generated.has(tick) ||
      (!labeledTicks.has(tick) && tick.childNodes.length)
    ) {
      continue
    }
    labeledTicks.add(tick)
    const { label } = partState(
      instance.part("tick", { time: Number(tick.getAttribute("time")) })
    ) as WaterfallTimeState
    if (tick.textContent !== label) {
      tick.textContent = label
    }
  }
}

// Set `items` to the spans, each with a `value`, a `label`, a `start`, a
// `duration` and its `children`. Without rows of its own, the waterfall
// renders a row for every span, from a <template> inside it when it has one.
function defineWaterfallElements() {
  createParts(waterfall, {
    root: {
      tag: owner,
      display: "block",
      state: {
        value: {
          get: (api: WaterfallApi) => api.getValue(),
          set: (api: WaterfallApi, value: string | null) =>
            api.setValue(value || null),
        },
        expanded: {
          get: (api: WaterfallApi) => api.getExpanded(),
          set: (api: WaterfallApi, value: string | string[] | null) =>
            api.setExpanded(
              typeof value === "string"
                ? value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                : (value ?? [])
            ),
        },
      },
      api: [
        "getValue",
        "setValue",
        "getExpanded",
        "setExpanded",
        "isExpanded",
        "expand",
        "collapse",
        "toggle",
        "expandAll",
        "collapseAll",
        "reveal",
        "focus",
      ],
      // Runs again whenever a property like `items` or `range` is set, so
      // rows are rebuilt only for new `items`.
      render(el, instance) {
        const api = instance.api
        const items = api.internal.items()
        if (renderedItems.get(el) !== items) {
          renderedItems.set(el, items)
          for (const child of Array.from(el.children)) {
            if (
              generated.has(child) &&
              child.localName === "ui-waterfall-row"
            ) {
              child.remove()
            }
          }
          // Rows of its own, like the ones a virtualized list renders, win over the data.
          if (!el.querySelector(":scope > ui-waterfall-row")) {
            el.append(...renderRows(api, templateOf(el)))
          }
        }
        const update = () => renderTicks(el, instance)
        update()
        // An axis's `max-ticks` and a tick's `time` change no state.
        const observer = new MutationObserver(update)
        observer.observe(el, {
          subtree: true,
          attributeFilter: ["max-ticks", "time"],
        })
        const unsubscribe = instance.subscribe(update)
        return () => {
          observer.disconnect()
          unsubscribe()
        }
      },
    },
    "header-row": { tag: "ui-waterfall-header-row", display: "block" },
    "column-header": { tag: "ui-waterfall-column-header", display: "block" },
    axis: { tag: "ui-waterfall-axis", display: "block" },
    tick: "ui-waterfall-tick",
    mark: "ui-waterfall-mark",
    row: { tag: "ui-waterfall-row", display: "block" },
    "row-header": { tag: "ui-waterfall-row-header", display: "block" },
    indicator: "ui-waterfall-indicator",
    cell: { tag: "ui-waterfall-cell", display: "block" },
    bar: { tag: "ui-waterfall-bar", display: "block" },
  })
}

export { defineWaterfallElements }
