// A carousel's indicators: a tablist with one tab stop, arrows that move
// between them and show their page, and pages inferred from their order.
import { dev } from "#dev"
import { checkName } from "#name-check"
import type {
  CarouselIndicatorProps,
  CarouselPageChangeReason,
} from "./carousel"
import type { State } from "./carousel-api"
import { opensElsewhere } from "../../foundation/platform/button"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import { moveIndex, radioStep } from "../../foundation/focus/collection"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { elements } from "../../foundation/kernel/elements"

function carouselIndicators(
  context: PrimitiveContext<object, State, string>,
  go: (page: number, reason: CarouselPageChangeReason, event?: Event) => boolean
) {
  const { id, store, element } = context

  // The page an indicator stands for: its `page`, or its place among the indicators.
  function indicatorPage(
    state: State,
    key: string,
    props: CarouselIndicatorProps | undefined
  ) {
    if (props?.page !== undefined) {
      return props.page
    }
    return state.indicators.indexOf(key) + 1
  }

  // Tab lands on the selected indicator. Before indicators bind, like on the
  // server, the selected one holds the stop, or the first one when pages
  // aren't known yet. Both axes move, since dots under a vertical carousel
  // usually sit in a row.
  const roving = createRovingFocus<State, CarouselIndicatorProps | undefined>(
    context,
    {
      slot: "indicator",
      key: "stop",
      remember: false,
      focusable: (item) => !element("indicator", item.key)?.hidden,
      preferred: (item) =>
        indicatorPage(store.get(), item.key, item.props) === store.get().page,
      claims(state, item) {
        const page = indicatorPage(state, item.key, item.props)
        return page === 0 || page === state.page
      },
      move(event, { from, items, rtl }) {
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          return
        }
        const step =
          event.key === "Home"
            ? "first"
            : event.key === "End"
              ? "last"
              : radioStep(event.key, rtl)
        if (step !== undefined) {
          return items[moveIndex(items.indexOf(from), step, items.length, true)]
            .key
        }
      },
      // Indicators without a `page` take theirs from their order.
      onItemsChange() {
        store.set({
          indicators: elements(context, "indicator").map((entry) => entry.key),
        })
        roving.check()
      },
    }
  )

  return {
    indicatorPage,
    roving,
    bindIndicator(
      el: HTMLElement,
      part: { key: string; props: CarouselIndicatorProps }
    ) {
      if (dev) {
        queueMicrotask(
          () =>
            el.isConnected &&
            checkName(el, "CarouselIndicator", { component: "carousel", id })
        )
      }
      return roving.bind(el, part)
    },
    pressIndicator(
      el: HTMLElement | undefined,
      key: string,
      props: CarouselIndicatorProps,
      event?: Event
    ) {
      if (opensElsewhere(event, el)) {
        return
      }
      const page = indicatorPage(store.get(), key, props)
      // Safari doesn't focus buttons on click, so arrow keys would go nowhere.
      if (el && document.activeElement !== el) {
        el.focus({ preventScroll: true })
      }
      if (page > 0) {
        go(page, "item-press", event)
      }
    },
    onIndicatorKeyDown(event: KeyboardEvent) {
      const moved = roving.keydown(event, event.target as HTMLElement)
      if (!moved || moved.key === moved.from) {
        return
      }
      // Links follow themselves, so routers and history see the navigation.
      const next = element("indicator", moved.key)
      if (next?.matches("a[href]")) {
        return next.click()
      }
      const page = indicatorPage(
        store.get(),
        moved.key,
        context.props("indicator", moved.key)
      )
      if (page > 0) {
        go(page, "list-navigation", event)
      }
    },
  }
}

export { carouselIndicators }
