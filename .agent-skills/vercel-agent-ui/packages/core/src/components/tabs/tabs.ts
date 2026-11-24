import {
  type Direction,
  orientationOf,
  scrollToShow,
} from "../../foundation/focus/collection"
import type { TabsGeneric } from "./tabs-generic"
import {
  bindFindable,
  hiddenAttrs,
} from "../../foundation/disclosure/disclosure"
import {
  buttonElement,
  opensElsewhere,
  type ButtonElement,
} from "../../foundation/platform/button"
import { layoutBox } from "../../foundation/platform/layout"
import { isRTL } from "../../foundation/platform/env"
import {
  bindIndicator,
  directionBetween,
} from "../../foundation/selection/indicator"
import {
  itemIconPart,
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import { animateIn, animateOut } from "../../foundation/motion/presence"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import { bindTabStop } from "../../foundation/focus/tabbable"
import { idPart } from "../../foundation/kernel/attrs"
import { createController } from "../../foundation/kernel/controller"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveContext,
  PrimitiveOptions,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import { selects } from "../../foundation/kernel/selects"
import { live } from "../../foundation/kernel/live"
import { createChange } from "../../foundation/kernel/input-source"
import { onProps, subscribe } from "../../foundation/kernel/part"

/**
 * Why the selection changed: a tab was pressed, arrow keys moved it, find in
 * page matched text in a hidden panel, the selected tab left the page, or a
 * controller or `api` call changed it.
 * @stable
 */
type TabsValueChangeReason =
  | "item-press"
  | "list-navigation"
  | "find-in-page"
  | "item-removed"
  | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type TabsChangeOptions = ChangeOptions<TabsValueChangeReason>

/**
 * Selects and inspects tabs from outside them: a keyboard shortcut, a link
 * elsewhere on the page, the URL or a test. Pass it as the `controller` option.
 * @stable
 */
function createTabsController<T extends string = string>() {
  return createController<{
    /** The selected tab's value, or null when nothing is selected. */
    getValue: () => T | null
    /** Selects a tab, or nothing with `null`. Disabled tabs never select. Returns false when canceled. */
    setValue: (value: T | null, options?: TabsChangeOptions) => boolean
    /** Selects a tab, the same as `setValue`. */
    select: (value: T, options?: TabsChangeOptions) => boolean
    /** Moves focus to the selected tab, or the tab that holds the tab stop. */
    focus: () => void
  }>()
}

/**
 * A controller from `createTabsController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type TabsController<T extends string = string> = ReturnType<
  typeof createTabsController<T>
>

/**
 * Which way the tabs run, which picks the arrow keys that move between them.
 * @stable
 */
type TabsOrientation = "horizontal" | "vertical"
/**
 * Which way the selection moved, on screen.
 * @stable
 */
type TabsDirection = Direction

/**
 * The options `tabs` takes. A component takes them as props on its root.
 * @stable
 */
type TabsOptions<T extends string = string> = {
  /** The selected tab's value. Pass it to control the tabs. `null` selects nothing. */
  value?: T | null
  /** The tab selected at first, when uncontrolled. Defaults to the first enabled tab, which never calls `onValueChange`. */
  defaultValue?: T | null
  /** Runs when the selection wants to change. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T | null,
    details: ChangeDetails<TabsValueChangeReason>
  ) => void
  /**
   * Which arrow keys move between tabs: left and right, or up and down.
   * @defaultValue "horizontal"
   */
  orientation?: TabsOrientation
  /**
   * `"automatic"` selects a tab as soon as arrow keys focus it. `"manual"` waits for Enter or Space.
   * @defaultValue "automatic"
   */
  activation?: "automatic" | "manual"
  /**
   * Whether arrow keys wrap from the last tab to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Keeps hidden panels in the page as `hidden="until-found"`, so the browser's
   * find in page can match their text and select their tab. Implies `keepMounted`.
   * @defaultValue false
   */
  hiddenUntilFound?: boolean
  /** Selects tabs from anywhere. Create one with `createTabsController()`. */
  controller?: TabsController<T>
} & PrimitiveOptions

type TabProps = {
  /** Identifies the tab and pairs it with the panel of the same value. */
  value: string
  /** Keeps the tab focusable but stops it from being selected, as the tabs pattern asks. */
  disabled?: boolean
}

type PanelProps = {
  /** The value of the tab this panel belongs to. */
  value: string
  /**
   * Whether the panel stays in the page, hidden, while its tab isn't selected.
   * @defaultValue false
   */
  keepMounted?: boolean
  /** Whether the panel stays findable with `hidden="until-found"` while its tab isn't selected. Overrides the tabs'. */
  hiddenUntilFound?: boolean
}

/**
 * The props the `tab` slot of `tabs` takes.
 * @stable
 */
type TabsTabProps = TabProps
/**
 * The props the `panel` slot of `tabs` takes.
 * @stable
 */
type TabsPanelProps = PanelProps

/**
 * The state the `root` slot of `tabs` hands `render` functions and state-based
 * class names.
 * @stable
 */
type TabsState<T extends string = string> = {
  /** The selected tab's value. */
  value: T | null
  /** The tabs' `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: TabsOrientation
  /** Which way the last selection moved. */
  direction: TabsDirection
}
/**
 * The state the `list` slot of `tabs` hands `render` functions and state-based
 * class names.
 * @stable
 */
type TabsListState = {
  /** The tabs' `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: TabsOrientation
}
/**
 * The state the `tab` slot of `tabs` hands `render` functions and state-based
 * class names.
 * @stable
 */
type TabsTabState = {
  /** Whether this tab's value is the tabs' `value`. */
  selected: boolean
  /** Whether this tab can't be selected. */
  disabled: boolean
}
/**
 * The state the `panel` slot of `tabs` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TabsPanelState = {
  /** Whether this panel's tab is selected. False while it animates out. */
  selected: boolean
}
/**
 * The props the `tab-icon` slot of `tabs` takes.
 * @stable
 */
type TabsTabIconProps = ItemIconProps
/**
 * The state the `tab-icon` slot of `tabs` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TabsTabIconState = ItemIconState
/**
 * The state the `indicator` slot of `tabs` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TabsIndicatorState = {
  /** The tabs' `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: TabsOrientation
  /** Which way the last selection moved. */
  direction: TabsDirection
}

type TabsStore = {
  value: string | null
  // Kept in state, not read from options, so changing it renders the parts again.
  orientation: TabsOrientation
  hiddenUntilFound: boolean
  direction: TabsDirection
  // Panels animating out. They stay present until their animation ends.
  exiting: string[]
  // The tab that takes focus from Tab: the selected one, or the first enabled
  // one when the selected one is missing or disabled. Null until tabs bind.
  stop: string | null
  // Panels in the page. Tabs point aria-controls only at these.
  panels: string[]
  // What each tab is rendered as when it isn't a button, like a link. Known
  // once it binds, so servers render buttons.
  elements: Record<string, ButtonElement>
}

const indicatorVariables = [
  "left",
  "right",
  "top",
  "bottom",
  "width",
  "height",
] as const

function writeIndicator(
  el: HTMLElement,
  rect: ReturnType<typeof layoutBox> | undefined
) {
  for (const name of indicatorVariables) {
    if (rect) {
      el.style.setProperty(`--active-tab-${name}`, `${rect[name]}px`)
    } else {
      el.style.removeProperty(`--active-tab-${name}`)
    }
  }
}

/**
 * `tabs`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface TabsApi extends ReturnType<typeof tabsApiBody> {}

function tabsApiBody(
  context: PrimitiveContext<TabsOptions, TabsStore, string>
) {
  const { id, store, options, element, props } = context
  const change = createChange(context)
  const panels = new Set<string>()
  // Selections made after mount animate. The first paint never does.
  let changed = false
  // The first check picks a default, which is not a change.
  let checked = false
  // The default's tab can bind after the others, like inside Suspense, so the
  // first tab stands in until it does, unless someone picks another.
  let awaited = options().defaultValue ?? null
  let standIn: string | null = null
  // Run after tabs come or go, which can move the selected tab without resizing it.
  const tabsChanged = new Set<() => void>()

  const orientation = () => store.get().orientation
  const controlled = () => options().value !== undefined
  const enabled = (tab: { props: TabProps | undefined }) => !tab.props?.disabled
  // Disabled tabs stay focusable, as the tabs pattern asks. Tab lands on the
  // selected one. Before tabs bind, the selected tab holds the stop, or with
  // nothing selected, the first enabled one claims it.
  const roving = createRovingFocus<TabsStore, TabProps>(context, {
    slot: "tab",
    key: "stop",
    orientation,
    loop: () => options().loop ?? true,
    remember: false,
    disabled: (tab) => !enabled(tab),
    preferred: (tab) => store.get().value === tab.key,
    claims: (state, tab) =>
      state.value === null ? enabled(tab) : state.value === tab.key,
    onItemsChange: check,
  })
  // The arrow key moving to a link tab while it clicks the link.
  let navigation: KeyboardEvent | undefined
  // Bound tabs in document order. The roving group keeps it cached, so a key
  // press never sorts every tab.
  const tabs = roving.items

  // Runs once tabs have bound or changed. Uncontrolled tabs always select
  // something, so the list never loses its tab stop.
  function check() {
    const list = tabs()
    if (list.length) {
      const initial = !checked
      checked = true
      const has = (key: string | null) => list.some((tab) => tab.key === key)
      let { value } = store.get()
      if (controlled()) {
        awaited = null
      }
      if (awaited !== null && has(awaited)) {
        const from = value
        value = awaited
        awaited = standIn = null
        if (from !== value) {
          store.set({ value })
        }
      }
      // With streaming, the default's tab can be in the server's markup while
      // its boundary waits to hydrate. It keeps the selection the server showed.
      const streamed =
        awaited !== null &&
        value === awaited &&
        !!list[0].el.ownerDocument.getElementById(
          `${id}-tab-${idPart(awaited)}`
        )
      if (!controlled() && !has(value) && !streamed) {
        const first = list.find(enabled)
        // The first pick is the default, so it calls nothing. A selected tab
        // that leaves the page later is a change.
        if (first && initial) {
          standIn = awaited === null ? null : first.key
          store.set({ value: first.key })
        } else if (first) {
          change("value", first.key, { reason: "item-removed" })
        }
      }
    }
    for (const listener of tabsChanged) {
      listener()
    }
  }

  // Until tabs bind, like on the server, uncontrolled tabs with nothing
  // selected show the tab that claims the stop as selected, which is the one
  // `check` selects, so the first render already shows its panel.
  function shows(state: TabsStore, key: string) {
    if (checked || state.value !== null || controlled()) {
      return state.value === key
    }
    const tab = props<TabProps>("tab", key)
    return !!tab && roving.tabIndex(state, { key, props: tab }) === "0"
  }

  // Brings the selected tab into view inside a scrolling list, focused too,
  // since browsers don't scroll a half-hidden element they focus. The page
  // itself never scrolls.
  function reveal(value: string | null) {
    const list = element("list")
    const tab = value === null ? undefined : element("tab", value)
    if (!list || !tab) {
      return
    }
    if (
      list.scrollWidth <= list.clientWidth &&
      list.scrollHeight <= list.clientHeight
    ) {
      return
    }
    const rect = layoutBox(tab, list)
    // Right to left, scrollLeft runs from 0 at the right edge to negative, so
    // the distances are measured from the right.
    const rtl = isRTL(list)
    const scrolled = scrollToShow(
      rtl ? -list.scrollLeft : list.scrollLeft,
      list.clientWidth,
      rtl ? list.clientWidth - rect.left - rect.width : rect.left,
      rect.width
    )
    list.scrollLeft = rtl ? -scrolled : scrolled
    list.scrollTop = scrollToShow(
      list.scrollTop,
      list.clientHeight,
      rect.top,
      rect.height
    )
  }

  // What selecting `value` brings with it from `state`: the direction the
  // selection moves, and the panel it leaves animating out.
  function selecting(state: TabsStore, value: string | null) {
    const from = state.value
    const rect = (key: string | null) =>
      key === null ? undefined : element("tab", key)?.getBoundingClientRect()
    return {
      direction: directionBetween(
        rect(from),
        rect(value),
        state.orientation
      ) as TabsDirection,
      exiting: [
        ...state.exiting.filter((key) => key !== value),
        ...(from !== null && panels.has(from) && !state.exiting.includes(from)
          ? [from]
          : []),
      ],
    }
  }

  // A value from options brings it in the same pass, with the tab stop on
  // the tab it selects.
  deriveFromOptions(
    context,
    ["direction", "exiting", "stop"],
    (synced, state) => {
      if (!("value" in synced) || synced.value === state.value) {
        return
      }
      const value = synced.value ?? null
      const stop = roving.stopFor((tab) => tab.key === value)
      return { ...selecting(state, value), ...(stop !== undefined && { stop }) }
    }
  )

  // Reacts to selection changes from any source: a press, a key, a controller
  // or a controlled value. Runs before anything renders the change.
  let previous = store.get().value
  store.subscribe(() => {
    const state = store.get()
    if (state.value === previous) {
      return
    }
    const from = previous
    previous = state.value
    if (state.value !== standIn) {
      awaited = null
    }
    changed = true
    store.set(selecting({ ...state, value: from }, state.value))
    roving.check()
    reveal(state.value)
  })

  // Selects a tab. Disabled tabs never select. Reads the props the tab last
  // rendered with, which it has before its element binds.
  function select(
    value: string | null,
    { reason = "imperative", event }: TabsChangeOptions = {}
  ) {
    if (
      value !== null &&
      (props("tab", value) as TabProps | undefined)?.disabled
    ) {
      return false
    }
    return change("value", value, { reason, event })
  }

  const api = {
    getValue: () => store.get().value,
    setValue: select,
    select,
    // Moves focus to the tab that holds the tab stop, the selected one unless it left.
    focus: () => roving.focus(),
    internal: {
      id,
      options,
      orientation,
      shows,
      isChanged: () => changed,
      listElement: () => element("list"),
      tabElement: (value: string) => element("tab", value),
      onTabsChange(listener: () => void) {
        tabsChanged.add(listener)
        return () => tabsChanged.delete(listener)
      },
      roving,
      registerPanel(key: string) {
        panels.add(key)
        store.set({ panels: [...panels] })
        return () => {
          panels.delete(key)
          const { exiting } = store.get()
          store.set({
            panels: [...panels],
            exiting: exiting.filter((value) => value !== key),
          })
        }
      },
      setElement(key: string, el: HTMLElement) {
        const element = buttonElement(el)
        const { elements } = store.get()
        if ((elements[key] ?? "button") !== element) {
          store.set({ elements: { ...elements, [key]: element } })
        }
      },
      finishExit(key: string) {
        store.set({
          exiting: store.get().exiting.filter((value) => value !== key),
        })
      },
      // How a press selects: as a press, or as the arrow key that clicked a link tab.
      pressDetails: (event?: Event) =>
        navigation
          ? { reason: "list-navigation" as const, event: navigation }
          : { reason: "item-press" as const, event },
      onKeyDown(event: KeyboardEvent) {
        // A handler of the user's that prevented the key keeps it.
        if (
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          return
        }
        const current = tabs().find((tab) => tab.el === event.target)
        if (!current) {
          return
        }
        const el = current.el

        // Native buttons and links activate themselves. Anything else, and
        // Space on a link, needs a click.
        if (event.key === "Enter" || event.key === " ") {
          const native =
            el.tagName === "BUTTON" ||
            (event.key === "Enter" && el.matches("a[href]"))
          if (native) {
            return
          }
          event.preventDefault()
          if (el.matches("a[href]")) {
            el.click()
          } else if (enabled(current)) {
            select(current.key, { reason: "item-press", event })
          }
          return
        }

        const moved = roving.keydown(event, el)
        const next =
          moved && moved.key !== moved.from
            ? tabs().find((tab) => tab.key === moved.key)
            : undefined
        if (!next || options().activation === "manual" || !enabled(next)) {
          return
        }
        // Links follow themselves, so routers and history see the navigation.
        // Their press still reports the key's navigation.
        if (next.el.matches("a[href]")) {
          navigation = event
          try {
            next.el.click()
          } finally {
            navigation = undefined
          }
        } else {
          select(next.key, { reason: "list-navigation", event })
        }
      },
    },
  }

  return api
}

const tabsApi: (...args: Parameters<typeof tabsApiBody>) => TabsApi =
  tabsApiBody

const findable = (state: TabsStore, props: PanelProps) =>
  props.hiddenUntilFound ?? state.hiddenUntilFound

const tabsPrimitive = /* @__PURE__ */ definePrimitive({
  name: "tabs",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    orientation: "string",
    activation: "string",
    loop: "boolean",
    hiddenUntilFound: "boolean",
    controller: "value",
  },
  state: (options: TabsOptions): TabsStore => ({
    value: options.defaultValue ?? null,
    orientation: orientationOf(options.orientation, "horizontal"),
    hiddenUntilFound: options.hiddenUntilFound ?? false,
    direction: "none",
    exiting: [],
    stop: null,
    panels: [],
    elements: {},
  }),
  live: ["panels"],
  sync: (options) => ({
    orientation: orientationOf(options.orientation, "horizontal"),
    hiddenUntilFound: options.hiddenUntilFound ?? false,
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: tabsApi,
  slots: (slot) => ({
    root: slot<{}, TabsState>({
      state: (state, { api }) => ({
        value: state.value,
        orientation: api.internal.orientation(),
        direction: state.direction,
      }),
      attrs: (state, { api }) => ({
        "data-orientation": api.internal.orientation(),
        "data-activation-direction": state.direction,
      }),
    }),

    list: slot<{}, TabsListState>({
      role: "tablist",
      keys: (state) => [
        ...(state.orientation === "vertical"
          ? ["ArrowUp", "ArrowDown"]
          : ["ArrowLeft", "ArrowRight"]),
        "Home",
        "End",
        "Enter",
        " ",
      ],
      state: (state, { api }) => ({ orientation: api.internal.orientation() }),
      attrs: (state, { api }) => ({
        "aria-orientation":
          api.internal.orientation() === "vertical" ? "vertical" : undefined,
        "data-orientation": api.internal.orientation(),
        "data-activation-direction": state.direction,
      }),
      on: {
        keydown: (event, { api }) => api.internal.onKeyDown(event),
      },
    }),

    tab: slot<TabProps, TabsTabState>({
      role: "tab",
      focus: "roving",
      props: { value: "string", disabled: "boolean" },
      // Until there's a stop, the selected tab holds it, or with nothing
      // selected, the first enabled one claims it: those hear a change to null.
      // Tabs never read which panels are exiting, which changes on every
      // switch, and point only at their own panel.
      selects: selects({
        value: ({ key }) => [key, null],
        stop: ({ key }) => [key, null],
        exiting: [],
        panels: ({ key }) => [key],
        elements: ({ key }) => [key],
      }),
      state: (state, { key, props, api }) => ({
        selected: api.internal.shows(state, key),
        disabled: !!props.disabled,
      }),
      attrs: (state, { id, key, props, api }) => {
        const selected = api.internal.shows(state, key)
        return {
          id: `${id}-tab-${idPart(key)}`,
          // On a link, `type` names the linked file's kind, so only a button gets one.
          type:
            (state.elements[key] ?? "button") === "button"
              ? "button"
              : undefined,
          tabindex: api.internal.roving.tabIndex(state, { key, props }),
          "aria-selected": String(selected),
          "aria-disabled": props.disabled ? "true" : undefined,
          "data-selected": selected ? "" : undefined,
          "data-disabled": props.disabled ? "" : undefined,
          "data-orientation": api.internal.orientation(),
          "data-activation-direction": state.direction,
        }
      },
      // Only panels in the page can be pointed at.
      live: live((state, { id, key }) => ({
        "aria-controls": state.panels.includes(key)
          ? `${id}-panel-${idPart(key)}`
          : undefined,
      })),
      press({ api, el, key, props }, event) {
        if (props.disabled) {
          // A disabled link must not navigate either.
          event?.preventDefault()
          return
        }
        if (opensElsewhere(event, el)) {
          return
        }
        // Safari doesn't focus buttons on click, so arrow keys would go nowhere.
        if (el && document.activeElement !== el) {
          el.focus({ preventScroll: true })
        }
        api.select(key, api.internal.pressDetails(event))
      },
      bind(el, part) {
        part.api.internal.setElement(part.key, el)
        return part.api.internal.roving.bind(el, part)
      },
    }),

    "tab-icon": slot(
      itemIconPart<TabsStore, TabsApi>({
        component: "tabs",
        item: '[role="tab"]',
        list: '[role="tablist"]',
      })
    ),

    indicator: slot<{}, TabsIndicatorState>({
      role: "presentation",
      state: (state, { api }) => ({
        orientation: api.internal.orientation(),
        direction: state.direction,
      }),
      attrs: (state, { api }) => ({
        "data-orientation": api.internal.orientation(),
        "data-activation-direction": state.direction,
      }),
      bind(el, { api, store }) {
        let value = store.get().value
        return bindIndicator({
          list: () => api.internal.listElement() ?? el.parentElement,
          active: () => {
            const { value } = store.get()
            return value === null ? undefined : api.internal.tabElement(value)
          },
          itemSelector: '[role="tab"]',
          subscribe(remeasure) {
            const unsubscribe = store.subscribe(() => {
              if (store.get().value === value) {
                return
              }
              value = store.get().value
              // Ahead of the render, so styles that skip transitions while
              // the direction is "none" animate the first move too.
              el.setAttribute(
                "data-activation-direction",
                store.get().direction
              )
              remeasure()
            })
            const offTabsChange = api.internal.onTabsChange(remeasure)
            return () => {
              unsubscribe()
              offTabsChange()
            }
          },
          write: (box) => writeIndicator(el, box),
        })
      },
    }),

    panel: slot<PanelProps, TabsPanelState>({
      role: "tabpanel",
      props: {
        value: "string",
        keepMounted: "boolean",
        hiddenUntilFound: "boolean",
      },
      // Panels never read the tab stop, which moves with every arrow key, or
      // which panels are in the page, and only ask whether they're exiting.
      // The one showing through the claim hears a change to or from null.
      selects: selects({
        value: ({ key }) => [key, null],
        stop: [],
        exiting: ({ key }) => [key],
        panels: [],
        elements: [],
      }),
      present: (state, { key, props, api }) =>
        !!props.keepMounted ||
        findable(state, props) ||
        api.internal.shows(state, key) ||
        state.exiting.includes(key),
      state: (state, { key, api }) => ({
        selected: api.internal.shows(state, key),
      }),
      attrs: (state, { id, key, props, api }) => ({
        id: `${id}-panel-${idPart(key)}`,
        "aria-labelledby": `${id}-tab-${idPart(key)}`,
        ...hiddenAttrs(
          api.internal.shows(state, key) || state.exiting.includes(key),
          findable(state, props)
        ),
        "data-selected": api.internal.shows(state, key) ? "" : undefined,
        "data-orientation": api.internal.orientation(),
        "data-activation-direction": state.direction,
      }),
      bind(el, part) {
        const { api, key, store } = part
        const cleanups = [api.internal.registerPanel(key)]

        // Find in page matched text in a hidden panel. Its tab selects.
        const found = bindFindable(el, {
          shown: () =>
            api.internal.shows(store.get(), key) ||
            store.get().exiting.includes(key),
          findable: () => findable(store.get(), part.props),
          reveal: (event) => api.select(key, { reason: "find-in-page", event }),
        })
        cleanups.push(
          found,
          subscribe(part, found.check),
          onProps(part, found.check)
        )

        // A panel is a tab stop only when nothing inside it can take focus,
        // so a panel that opens with a field doesn't add a stop before it.
        const tabStop = bindTabStop(el, () => true)
        cleanups.push(tabStop.stop)

        // Enter and exit animations, never on the first paint.
        let stop: (() => void) | undefined
        let selected = api.internal.shows(store.get(), key)
        if (selected && api.internal.isChanged()) {
          stop = animateIn(el)
        }
        cleanups.push(
          subscribe(part, () => {
            const { exiting } = store.get()
            if (api.internal.shows(store.get(), key) === selected) {
              return
            }
            selected = !selected
            stop?.()
            stop = undefined
            // Ahead of the render, for exit keyframes keyed on the state.
            el.toggleAttribute("data-selected", selected)
            if (selected) {
              stop = animateIn(el)
            } else if (exiting.includes(key)) {
              stop = animateOut(el, () => {
                stop = undefined
                api.internal.finishExit(key)
              })
            }
          })
        )
        cleanups.push(() => stop?.())
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
  }),
  agent: { actions: ["setValue"], closed: true, reveals: true },
})
/**
 * The type of `tabs`.
 * @stable
 */
interface TabsPrimitive extends WithGeneric<
  typeof tabsPrimitive,
  TabsGeneric
> {}

/**
 * The tabs primitive, with the slots `root`, `list`, `tab`, `tab-icon`,
 * `indicator`, `panel`.
 * Render it with a renderer's `createParts`, or compose it inside your own
 * primitive.
 * @stable
 */
const tabs = tabsPrimitive as TabsPrimitive

export {
  createTabsController,
  tabs,
  type TabsApi,
  type TabsChangeOptions,
  type TabsController,
  type TabsDirection,
  type TabsIndicatorState,
  type TabsListState,
  type TabsOptions,
  type TabsOrientation,
  type TabsPanelProps,
  type TabsPanelState,
  type TabsPrimitive,
  type TabsState,
  type TabsTabIconProps,
  type TabsTabIconState,
  type TabsTabProps,
  type TabsTabState,
  type TabsValueChangeReason,
}
