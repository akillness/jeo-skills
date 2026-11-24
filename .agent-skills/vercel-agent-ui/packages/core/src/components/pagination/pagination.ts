import {
  clampPage,
  pageCountOf,
  paginationRange,
  type PaginationRangeItem,
} from "./pagination-range"
import { opensElsewhere } from "../../foundation/platform/button"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { createChange } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"

/**
 * Why a pagination's page wants to change.
 * @stable
 */
type PaginationPageChangeReason =
  | "item-press"
  | "previous-press"
  | "next-press"
  | "first-press"
  | "last-press"
  | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type PaginationChangeOptions = ChangeOptions<PaginationPageChangeReason>

/**
 * Pages a pagination from anywhere. Pass it as the `controller` option.
 * @stable
 */
function createPaginationController() {
  return createController<{
    /** The current page, from 1. */
    getPage: () => number
    /** How many pages there are. */
    getPageCount: () => number
    /** Goes to a page, clamped to the range. Returns false when canceled or already there. */
    setPage: (page: number, options?: PaginationChangeOptions) => boolean
    /** Goes to the next page. Returns false on the last page. */
    next: (options?: PaginationChangeOptions) => boolean
    /** Goes to the previous page. Returns false on the first page. */
    previous: (options?: PaginationChangeOptions) => boolean
    /** Goes to the first page. */
    first: (options?: PaginationChangeOptions) => boolean
    /** Goes to the last page. */
    last: (options?: PaginationChangeOptions) => boolean
  }>()
}

/**
 * A controller from `createPaginationController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type PaginationController = ReturnType<typeof createPaginationController>

/**
 * The options `pagination` takes. A component takes them as props on its root.
 * @stable
 */
type PaginationOptions = {
  /** The current page, from 1. Pass it to control the pagination. */
  page?: number
  /**
   * The page it starts on, when uncontrolled.
   * @defaultValue 1
   */
  defaultPage?: number
  /**
   * Runs when the page wants to change: a page link (`"item-press"`), the
   * Previous, Next, First or Last part, or a controller (`"imperative"`).
   * `details.cancel()` keeps the page, and stops a link from navigating.
   */
  onPageChange?: (
    page: number,
    details: ChangeDetails<PaginationPageChangeReason>
  ) => void
  /** How many pages there are. Or pass `total` and `pageSize`. */
  pageCount?: number
  /** How many items there are, for `pageCount` from `pageSize`. */
  total?: number
  /**
   * How many items fit on a page, with `total`.
   * @defaultValue 10
   */
  pageSize?: number
  /**
   * How many pages show on each side of the current one.
   * @defaultValue 1
   */
  siblings?: number
  /**
   * How many pages always show at each end.
   * @defaultValue 1
   */
  boundaries?: number
  /**
   * The URL of a page. With it, parts are links: they navigate, open in a new
   * tab with a modifier key, and work before JavaScript loads. Without it, they're buttons.
   */
  getHref?: (page: number) => string
  /**
   * Whether every page and step does nothing, like a step at its end. A controller still pages it.
   * @defaultValue false
   */
  disabled?: boolean
  /** Pages it from anywhere. Create one with `createPaginationController()`. */
  controller?: PaginationController
} & PrimitiveOptions

/**
 * What `render` functions and state-based class names of Pagination and PaginationList receive.
 * @stable
 */
type PaginationState = {
  /** The current page, from 1. */
  page: number
  /** How many pages there are. */
  pageCount: number
  /** The pages to show, with an ellipsis for each gap. Render a PaginationLink or a PaginationEllipsis for each. */
  items: PaginationRangeItem[]
}

/**
 * What `render` functions and state-based class names of PaginationLink receive.
 * @stable
 */
type PaginationLinkState = {
  /** The page it goes to, from its `page` prop. */
  page: number
  /** Whether it's the current page. */
  current: boolean
}

/**
 * What `render` functions and state-based class names of PaginationPrevious, PaginationNext, PaginationFirst and PaginationLast receive.
 * @stable
 */
type PaginationStepState = {
  /** The page it goes to. */
  page: number
  /** Whether it's at the end it goes to, or the pagination is disabled, so it does nothing. */
  disabled: boolean
}

/**
 * The props the `link` slot of `pagination` takes.
 * @stable
 */
type PaginationLinkProps = {
  /** The page the link goes to, from 1. */
  page: number
}

type State = {
  page: number
  pageCount: number
  siblings: number
  boundaries: number
  getHref: ((page: number) => string) | undefined
  disabled: boolean
  // A step link the browser is about to follow, which keeps its href until it has.
  held: { step: Step; page: number } | null
}

type Step = "previous" | "next" | "first" | "last"

const currentPage = (state: State) => clampPage(state.page, state.pageCount)

// Where a step part points. A step link the browser is about to follow keeps
// its target; the controller steps from the current page whatever is held.
function stepTarget(state: State, step: Step, holds = true) {
  if (holds && state.held?.step === step) {
    return { page: state.held.page, disabled: false }
  }
  const page = currentPage(state)
  const target = {
    previous: page - 1,
    next: page + 1,
    first: 1,
    last: state.pageCount,
  }[step]
  const atEnd =
    step === "previous" || step === "first"
      ? page === 1
      : page === state.pageCount
  return { page: clampPage(target, state.pageCount), disabled: atEnd }
}

// What a step part does: nothing at its end or while the pagination is disabled.
function stepPart(state: State, step: Step) {
  const target = stepTarget(state, step)
  return state.disabled ? { ...target, disabled: true } : target
}

// A link with `getHref`, else a button. A link at an end has no `href`, so it
// goes nowhere, keeps focus with `tabindex="-1"` if it had it, and its step
// slot names it a link.
function partAttrs(state: State, page: number, disabled: boolean) {
  const disabledAttrs = {
    "aria-disabled": disabled ? "true" : undefined,
    "data-disabled": disabled ? "" : undefined,
  }
  if (!state.getHref) {
    return { type: "button", ...disabledAttrs }
  }
  if (disabled) {
    return { tabindex: "-1", ...disabledAttrs }
  }
  return { href: state.getHref(page) }
}

const settings = (options: PaginationOptions) => ({
  pageCount:
    options.pageCount !== undefined
      ? Math.max(1, Math.floor(options.pageCount) || 1)
      : options.total !== undefined
        ? pageCountOf(options.total, options.pageSize ?? 10)
        : 1,
  siblings: options.siblings ?? 1,
  boundaries: options.boundaries ?? 1,
  getHref: options.getHref,
  disabled: !!options.disabled,
})

const paginationPrimitive = /* @__PURE__ */ definePrimitive({
  name: "pagination",
  options: {
    page: "number",
    defaultPage: "number",
    onPageChange: "callback",
    pageCount: "number",
    total: "number",
    pageSize: "number",
    siblings: "number",
    boundaries: "number",
    getHref: "value",
    disabled: "boolean",
    controller: "value",
  },
  state: (options: PaginationOptions): State => ({
    page: options.page ?? options.defaultPage ?? 1,
    held: null,
    ...settings(options),
  }),
  controlled: ["page"],
  sync: (options) => ({
    ...(options.page === undefined ? {} : { page: options.page }),
    ...settings(options),
  }),
  api: (context) => {
    const { store, element } = context
    const change = createChange(context)
    let cached: { key: string; items: PaginationRangeItem[] } | undefined

    // The range, the same array until something it depends on changes, so
    // parts that render it don't render again for nothing.
    function items() {
      const state = store.get()
      const page = currentPage(state)
      const key = `${page}:${state.pageCount}:${state.siblings}:${state.boundaries}`
      if (cached?.key !== key) {
        cached = {
          key,
          items: paginationRange({
            ...state,
            page,
            pageCount: state.pageCount,
          }),
        }
      }
      return cached.items
    }

    // Puts focus back when the new page took it away: the pressed part was
    // rendered again, like a list keyed by index or by page, or a link moved,
    // which blurs it. Focus goes to the pressed part, or the one that replaced
    // it: the current page's link, or the same step. A frame later, once
    // frameworks have rendered. Focus the app moved on purpose stays.
    function keepFocus(
      pressed: { el: HTMLElement; slot: "link" | Step } | undefined
    ) {
      const root = element("root")
      const doc = root?.ownerDocument
      if (!pressed || !doc || !root.contains(doc.activeElement)) {
        return
      }
      requestAnimationFrame(() => {
        if (doc.activeElement && doc.activeElement !== doc.body) {
          return
        }
        const page = currentPage(store.get())
        const target = pressed.el.isConnected
          ? pressed.el
          : pressed.slot === "link"
            ? elements<PaginationLinkProps>(context, "link").find(
                (link) => link.props?.page === page
              )?.el
            : element(pressed.slot)
        target?.focus({ preventScroll: true })
      })
    }

    function go(
      page: number,
      reason: PaginationPageChangeReason,
      event?: Event,
      pressed?: { el: HTMLElement; slot: "link" | Step }
    ) {
      const state = store.get()
      const target = clampPage(page, state.pageCount)
      if (target === currentPage(state)) {
        return false
      }
      keepFocus(pressed)
      return change("page", target, { reason, event })
    }

    const step =
      (kind: Step) =>
      ({ reason = "imperative", event }: PaginationChangeOptions = {}) => {
        const target = stepTarget(store.get(), kind, false)
        return !target.disabled && go(target.page, reason, event)
      }

    return {
      getPage: () => currentPage(store.get()),
      getPageCount: () => store.get().pageCount,
      setPage: (
        page: number,
        { reason = "imperative", event }: PaginationChangeOptions = {}
      ) => go(page, reason, event),
      next: step("next"),
      previous: step("previous"),
      first: step("first"),
      last: step("last"),
      internal: {
        items,
        // A press on a page link or a step part. A link pressed with a
        // modifier opens elsewhere and leaves the page as it is. A canceled
        // change stops a link from navigating.
        press(
          slot: "link" | Step,
          target: { page: number; disabled?: boolean },
          event: Event | undefined,
          el: HTMLElement | undefined
        ) {
          if (target.disabled) {
            return event?.preventDefault()
          }
          if (
            opensElsewhere(event, el) ||
            target.page === currentPage(store.get())
          ) {
            return
          }
          const reason =
            slot === "link" ? "item-press" : (`${slot}-press` as const)
          // The browser follows a link after the click, when a framework may
          // already have rendered the new page: Next would point one page
          // further, or lose its href on the last page. So a step link holds
          // its href until then.
          if (slot !== "link" && el?.matches("a[href]")) {
            store.set({ held: { step: slot, page: target.page } })
            setTimeout(() => store.set({ held: null }))
          }
          if (!go(target.page, reason, event, el && { el, slot })) {
            event?.preventDefault()
          }
        },
      },
    }
  },
  slots: (slot) => {
    const rangeState = (
      state: State,
      { api }: { api: { internal: { items: () => PaginationRangeItem[] } } }
    ) => ({
      page: currentPage(state),
      pageCount: state.pageCount,
      items: api.internal.items(),
    })
    const stepSlot = (kind: Step) =>
      slot<{}, PaginationStepState>({
        role: (state) =>
          state.getHref && stepPart(state, kind).disabled ? "link" : undefined,
        roles: ["link"],
        focus: "native",
        state: (state) => stepPart(state, kind),
        attrs: (state) => {
          const target = stepPart(state, kind)
          return partAttrs(state, target.page, target.disabled)
        },
        press: ({ api, store, el }, event) =>
          api.internal.press(kind, stepPart(store.get(), kind), event, el),
      })
    return {
      root: slot<{}, PaginationState>({
        // A <nav>, or a web component, which needs the role.
        role: "navigation",
        state: rangeState,
        attrs: (state) => ({
          "data-disabled": state.disabled ? "" : undefined,
        }),
      }),
      list: slot<{}, PaginationState>({
        // Safari drops list semantics from lists styled with `list-style: none`, like Tailwind's reset does.
        role: "list",
        state: rangeState,
      }),
      item: slot({ role: "listitem" }),
      link: slot<PaginationLinkProps, PaginationLinkState>({
        props: { page: "number" },
        role: (state) => (state.getHref && state.disabled ? "link" : undefined),
        roles: ["link"],
        focus: "native",
        state: (state, { props }) => ({
          page: props.page,
          current: props.page === currentPage(state),
        }),
        attrs: (state, { props }) => {
          const current = props.page === currentPage(state)
          return {
            ...partAttrs(state, props.page, state.disabled),
            "aria-current": current ? "page" : undefined,
            "data-current": current ? "" : undefined,
          }
        },
        press: ({ api, props, store, el }, event) =>
          api.internal.press(
            "link",
            { page: props.page, disabled: store.get().disabled },
            event,
            el
          ),
      }),
      previous: stepSlot("previous"),
      next: stepSlot("next"),
      first: stepSlot("first"),
      last: stepSlot("last"),
      // Only the gap's look. The links on each side already say which pages there are.
      ellipsis: slot({ attrs: () => ({ "aria-hidden": "true" }) }),
    }
  },
  agent: { actions: ["setPage", "next", "previous", "first", "last"] },
})

/**
 * The type of `pagination`.
 * @stable
 */
interface PaginationPrimitive extends Named<typeof paginationPrimitive> {}

/**
 * The pagination primitive, with the slots `root`, `list`, `item`, `link`,
 * `previous`, `next`, `first`, `last`, `ellipsis`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const pagination: PaginationPrimitive = paginationPrimitive

export {
  createPaginationController,
  pagination,
  type PaginationChangeOptions,
  type PaginationController,
  type PaginationLinkProps,
  type PaginationLinkState,
  type PaginationOptions,
  type PaginationPageChangeReason,
  type PaginationPrimitive,
  type PaginationState,
  type PaginationStepState,
}
export {
  paginationRange,
  type PaginationRangeItem,
  type PaginationRangeOptions,
} from "./pagination-range"
