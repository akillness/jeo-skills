// A carousel's keys on its viewport: arrows page along the orientation,
// Home and End go to the ends, and focus in a slide that leaves moves to the
// page that came in.
import type { CarouselPageChangeReason } from "./carousel"
import { stepPage } from "./carousel-layout"
import type { State } from "./carousel-api"
import { stepFor } from "../../foundation/focus/collection"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { elements } from "../../foundation/kernel/elements"

// Keys that elements inside a slide keep for themselves: fields move their
// caret, and composite widgets move between their items.
const keepsArrows =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"], [role="listbox"], [role="grid"], [role="tablist"], [role="menu"], [role="menubar"], [role="radiogroup"], [role="tree"], [role="toolbar"]'

function carouselKeys(
  context: PrimitiveContext<object, State, string>,
  go: (
    page: number,
    reason: CarouselPageChangeReason,
    event?: Event,
    by?: 1 | -1
  ) => boolean,
  readDirection: () => boolean
) {
  const { store } = context
  // Arrow keys, Home and End on the viewport page, unless something inside keeps them.
  return function onViewportKeyDown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return
    }
    const target = event.target as Element
    if (target.closest(keepsArrows)) {
      return
    }
    const { page, orientation, loop, pageCount: count } = store.get()
    const step = stepFor(event.key, orientation, readDirection())
    if (step === undefined || count === null) {
      return
    }
    event.preventDefault()
    const next =
      step === "first"
        ? 1
        : step === "last"
          ? count
          : stepPage(page, step === 1 ? 1 : -1, count, loop)
    const slide = elements(context, "item").find(({ el }) =>
      el.contains(target)
    )
    const by = step === 1 || step === -1 ? step : undefined
    if (!go(next, "list-navigation", event, by) || !slide) {
      return
    }
    // Focus was in a slide that's leaving: it moves to the page that came in.
    const first = store.get().pages[store.get().page - 1]?.[0]
    if (!first || first === slide.key) {
      return
    }
    const el = context.element("item", first)
    if (!el) {
      return
    }
    if (!el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1")
    }
    // It's still out of view, so inert, until the viewport gets there. Holding
    // focus keeps it live.
    store.set({ focused: first })
    el.focus({ preventScroll: true })
  }
}

export { carouselKeys }
