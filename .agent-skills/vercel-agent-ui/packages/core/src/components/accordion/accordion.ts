import { isDisabled, watchFormDisabled } from "../../foundation/forms/form"
import { warn } from "#dev"
import {
  bindPanel,
  bindTriggerElement,
  createPendingReason,
  focusPressedTrigger,
  hiddenAttrs,
  openAttrs,
  triggerKeydown,
} from "../../foundation/disclosure/disclosure"
import { stateAndRenders } from "../../foundation/motion/panel"
import type { AccordionGeneric } from "./accordion-generic"
import { idPart } from "../../foundation/kernel/attrs"
import { createController } from "../../foundation/kernel/controller"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import {
  createDetails,
  type ChangeDetails,
  type ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveContext,
  PrimitiveOptions,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import { selects } from "../../foundation/kernel/selects"
import { live } from "../../foundation/kernel/live"
import {
  changeSource,
  createChange,
} from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"

/**
 * Why items opened or closed: a trigger was pressed, find in page matched
 * text in a closed panel, or a controller or `api` call changed them.
 * @stable
 */
type AccordionValueChangeReason =
  "trigger-press" | "find-in-page" | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type AccordionChangeOptions = ChangeOptions<AccordionValueChangeReason>

/**
 * Opens and closes items from outside the accordion: an "Expand all" button,
 * a link to a question on the page or a test. Pass it as the `controller` option.
 * @stable
 */
function createAccordionController<T extends string = string>() {
  return createController<{
    /** The open items' values. */
    getValue: () => T[]
    /** Sets the open items. Only the first counts unless `multiple` is set. Returns false when canceled. */
    setValue: (value: T[], options?: AccordionChangeOptions) => boolean
    /** Whether an item is open. */
    isOpen: (value: T) => boolean
    /** Opens an item. With one item open at a time, closes the others. */
    open: (value: T, options?: AccordionChangeOptions) => boolean
    /** Closes an item, unless it's the one item that must stay open. */
    close: (value: T, options?: AccordionChangeOptions) => boolean
    /** Opens a closed item, or closes an open one. */
    toggle: (value: T, options?: AccordionChangeOptions) => boolean
    /** Opens every enabled item. Only when `multiple` is set. */
    openAll: (options?: AccordionChangeOptions) => boolean
    /** Closes every item that may close. */
    closeAll: (options?: AccordionChangeOptions) => boolean
    /** Moves focus to an item's trigger, or the first trigger. */
    focus: (value?: T) => void
  }>()
}

/**
 * A controller from `createAccordionController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type AccordionController<T extends string = string> = ReturnType<
  typeof createAccordionController<T>
>

/**
 * The options `accordion` takes. A component takes them as props on its root.
 * @stable
 */
type AccordionOptions<T extends string = string> = {
  /** The open items' values. Pass it to control the accordion. */
  value?: T[]
  /**
   * The items open at first, when uncontrolled.
   * @defaultValue []
   */
  defaultValue?: T[]
  /** Runs when items want to open or close. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T[],
    details: ChangeDetails<AccordionValueChangeReason>
  ) => void
  /**
   * Whether several items can be open at once. Otherwise opening one closes the others.
   * @defaultValue false
   */
  multiple?: boolean
  /**
   * Whether the open item can close when only one may be open. With `false`,
   * one item always stays open and its trigger reports it can't be pressed.
   * @defaultValue true
   */
  collapsible?: boolean
  /**
   * Stops every item from opening or closing. Triggers stay focusable.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Whether closed panels stay in the page, hidden.
   * @defaultValue false
   */
  keepMounted?: boolean
  /**
   * Keeps closed panels in the page as `hidden="until-found"`, so the browser's
   * find in page can match their text and open them.
   * @defaultValue false
   */
  hiddenUntilFound?: boolean
  /** Opens and closes items from anywhere. Create one with `createAccordionController()`. */
  controller?: AccordionController<T>
} & PrimitiveOptions

type ItemProps = {
  /** Identifies the item. The accordion's value lists the open items' values. Defaults to a generated id. */
  value: string
  /**
   * Stops the item from opening or closing. Its trigger stays focusable.
   * @defaultValue false
   */
  disabled?: boolean
  /** Runs before the item opens or closes, before the accordion's `onValueChange`. `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<AccordionValueChangeReason>
  ) => void
  /** Runs once the item's panel has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
}

type HeaderProps = {
  /** @internal The value of the item the header belongs to. Parts read it from the item. */
  value?: string
}

type TriggerProps = {
  /** @internal The value of the item the trigger belongs to. Parts read it from the item. */
  value?: string
  /**
   * Stops this trigger from opening or closing the item. It stays focusable.
   * @defaultValue false
   */
  disabled?: boolean
}

type PanelProps = {
  /** @internal The value of the item the panel belongs to. Parts read it from the item. */
  value?: string
  /** Whether the panel stays in the page, hidden, while closed. Overrides the accordion's. */
  keepMounted?: boolean
  /** Whether the panel stays findable with `hidden="until-found"` while closed. Overrides the accordion's. */
  hiddenUntilFound?: boolean
}

// Public prop types. Headers, triggers and panels take their value from the item around them.
/**
 * The props the `item` slot of `accordion` takes.
 * @stable
 */
type AccordionItemProps<T extends string = string> = Omit<
  ItemProps,
  "value"
> & {
  /** Identifies the item. The accordion's value lists the open items' values. Defaults to a generated id. */
  value?: T
}
/**
 * The props the `header` slot of `accordion` takes.
 * @stable
 */
type AccordionHeaderProps = Omit<HeaderProps, "value">
/**
 * The props the `trigger` slot of `accordion` takes.
 * @stable
 */
type AccordionTriggerProps = Omit<TriggerProps, "value">
/**
 * The props the `panel` slot of `accordion` takes.
 * @stable
 */
type AccordionPanelProps = Omit<PanelProps, "value">

/**
 * The state the `root` slot of `accordion` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AccordionState<T extends string = string> = {
  /** The open items' values. */
  value: T[]
  /** Whether the whole accordion is disabled, by its `disabled` option or a disabled fieldset around it. */
  disabled: boolean
  /** Whether several items can be open at once. */
  multiple: boolean
}
/**
 * The state the `item` slot of `accordion` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AccordionItemState = {
  /** Whether the accordion's `value` holds this item's value. */
  open: boolean
  /** Whether the item can't open or close. */
  disabled: boolean
  /** The item's position among the accordion's items, from 0. -1 until it's in the page. */
  index: number
}
/**
 * The state the `header` slot of `accordion` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AccordionHeaderState = AccordionItemState
/**
 * The state the `trigger` slot of `accordion` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AccordionTriggerState = AccordionItemState
/**
 * The state the `panel` slot of `accordion` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AccordionPanelState = AccordionItemState

type AccordionStore = {
  value: string[]
  // Options that change rendering live in state, so changing them renders again.
  multiple: boolean
  collapsible: boolean
  disabled: boolean
  // Disabled by a fieldset around it.
  formDisabled: boolean
  keepMounted: boolean
  hiddenUntilFound: boolean
  // Panels animating out. They stay shown until their animation ends.
  exiting: string[]
  // Panels in the page. Triggers point aria-controls only at these.
  panels: string[]
  // Items in the page, in order.
  items: string[]
}

function nextValue(
  value: string[],
  key: string,
  open: boolean,
  multiple: boolean
) {
  if (!open) {
    return value.filter((item) => item !== key)
  }
  if (value.includes(key)) {
    return value
  }
  return multiple ? [...value, key] : [key]
}

// Whether the open item must stay open: only one may be open and it can't collapse.
function locked(state: AccordionStore, key: string) {
  return !state.multiple && !state.collapsible && state.value.includes(key)
}

type Cause = AccordionChangeOptions

/**
 * `accordion`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface AccordionApi extends ReturnType<typeof accordionApiBody> {}

function accordionApiBody(
  context: PrimitiveContext<AccordionOptions, AccordionStore, string>
) {
  const { id, store, options, element, props } = context
  const change = createChange(context)
  const panels = new Set<string>()
  const items = new Set<string>()
  const itemElements = new Set<Element>()
  // Items opened after mount, with the reason they opened. Their panels animate
  // in; panels open on the first paint don't, and find in page shows at once.
  const opened = new Map<string, AccordionValueChangeReason>()
  const reason = createPendingReason<AccordionValueChangeReason>("imperative")

  const isOpen = (key: string) => store.get().value.includes(key)
  const itemProps = (key: string) => props("item", key) as ItemProps | undefined
  const itemDisabled = (key: string) =>
    isDisabled(store.get()) || !!itemProps(key)?.disabled

  // Every item's open callback hears first, and any of them can stop the change.
  function setValue(
    value: string[],
    { reason: why = "imperative", event }: Cause = {}
  ) {
    const state = store.get()
    const next = state.multiple ? value : value.slice(0, 1)
    for (const key of new Set([...state.value, ...next])) {
      const open = next.includes(key)
      if (open === state.value.includes(key)) {
        continue
      }
      const onOpenChange = itemProps(key)?.onOpenChange
      if (!onOpenChange) {
        continue
      }
      const details = createDetails(
        { reason: why, event },
        changeSource(why, event)
      )
      onOpenChange(open, details)
      if (details.canceled) {
        return false
      }
    }
    reason.set(why)
    const changed = change("value", next, { reason: why, event })
    if (!changed) {
      reason.take()
    }
    return changed
  }

  function setOpen(key: string, open: boolean, cause: Cause = {}) {
    const state = store.get()
    if (isOpen(key) === open) {
      return false
    }
    if (!open && locked(state, key)) {
      return false
    }
    return setValue(nextValue(state.value, key, open, state.multiple), cause)
  }

  // The panels animating out once `value` replaces `from`: the ones it
  // closes, and the ones already leaving that it doesn't open again.
  function exitingAfter(from: string[], value: string[], exiting: string[]) {
    const closed = from.filter(
      (key) => !value.includes(key) && panels.has(key) && !exiting.includes(key)
    )
    return [...exiting.filter((key) => !value.includes(key)), ...closed]
  }

  // A closing panel animates out in the same pass as a controlled `value`.
  deriveFromOptions(context, ["exiting"], (synced, state) =>
    "value" in synced && synced.value !== state.value
      ? {
          exiting: exitingAfter(
            state.value,
            synced.value as string[],
            state.exiting
          ),
        }
      : undefined
  )

  // Reacts to value changes from any source: a press, find in page, a
  // controller or a controlled value. Runs before anything renders the change.
  let previous = store.get().value
  store.subscribe(() => {
    const { value, exiting } = store.get()
    if (value === previous) {
      return
    }
    const from = previous
    // A later value from options, like a controlled "Expand all", isn't this change.
    const why = reason.take()
    for (const key of value) {
      if (!from.includes(key)) {
        opened.set(key, why)
      }
    }
    for (const key of from) {
      if (!value.includes(key)) {
        opened.delete(key)
      }
    }
    previous = value
    store.set({ exiting: exitingAfter(from, value, exiting) })
  })

  // Items in document order where they're in the DOM, else in the order they registered.
  function syncItems() {
    itemsChanged = false
    const inPage = elements(context, "item")
      .map((entry) => entry.key)
      .filter((key) => items.has(key))
    store.set({
      items: [...inPage, ...[...items].filter((key) => !inPage.includes(key))],
    })
  }

  // Items and panels mount one by one, so the lists of them are written once
  // after the last, not again for each.
  // A panel opening changes the panels only, so the items keep their order.
  let syncQueued = false
  let itemsChanged = false
  function queueSync(items = false) {
    itemsChanged ||= items
    if (syncQueued) {
      return
    }
    syncQueued = true
    queueMicrotask(() => {
      syncQueued = false
      store.set({ panels: [...panels] })
      if (itemsChanged) {
        syncItems()
      }
    })
  }

  const api = {
    id,
    options,
    getValue: () => store.get().value,
    setValue,
    isOpen,
    open: (value: string, cause?: Cause) => setOpen(value, true, cause),
    close: (value: string, cause?: Cause) => setOpen(value, false, cause),
    toggle: (value: string, cause?: Cause) =>
      setOpen(value, !isOpen(value), cause),
    openAll(cause?: Cause) {
      if (!store.get().multiple) {
        warn("openAll() needs an accordion with `multiple`.", {
          component: "accordion",
          id,
        })
        return false
      }
      if (itemsChanged) {
        syncItems()
      }
      const enabled = store.get().items.filter((key) => !itemDisabled(key))
      return setValue([...new Set([...store.get().value, ...enabled])], cause)
    },
    closeAll(cause?: Cause) {
      const state = store.get()
      return setValue(
        state.value.filter((key) => locked(state, key) || itemDisabled(key)),
        cause
      )
    },
    focus(value?: string) {
      const trigger =
        value === undefined
          ? elements(context, "trigger")[0]?.el
          : element("trigger", value)
      trigger?.focus()
    },
    internal: {
      itemDisabled,
      syncItems,
      triggerElement: (value: string) => element("trigger", value),
      // An open panel animates in only when it opened after mount. Find in
      // page shows its match at once.
      opening: (key: string) => {
        const why = opened.get(key)
        if (why === undefined) {
          return "mount" as const
        }
        return why === "find-in-page"
          ? ("instant" as const)
          : ("animate" as const)
      },
      settled(key: string, open: boolean) {
        opened.delete(key)
        itemProps(key)?.onOpenChangeComplete?.(open)
      },
      registerItem(key: string, el: Element) {
        items.add(key)
        itemElements.add(el)
        queueSync(true)
        return () => {
          items.delete(key)
          itemElements.delete(el)
          queueSync(true)
        }
      },
      // Whether a change in the page happened inside an item, like its panel
      // mounting, which leaves the items' order as it was.
      insideItem(node: Node | null, root: Element) {
        for (; node && node !== root; node = node.parentNode) {
          if (itemElements.has(node as Element)) {
            return true
          }
        }
        return false
      },
      registerPanel(key: string) {
        panels.add(key)
        queueSync()
        return () => {
          panels.delete(key)
          queueSync()
          const { exiting } = store.get()
          if (exiting.includes(key)) {
            store.set({ exiting: exiting.filter((value) => value !== key) })
          }
        }
      },
      finishExit(key: string) {
        store.set({
          exiting: store.get().exiting.filter((value) => value !== key),
        })
      },
    },
  }

  return api
}

const accordionApi: (
  ...args: Parameters<typeof accordionApiBody>
) => AccordionApi = accordionApiBody

const disabledOf = (
  state: AccordionStore,
  key: string,
  api: AccordionApi,
  own?: boolean
) => !!own || isDisabled(state) || api.internal.itemDisabled(key)

const keepsMounted = (state: AccordionStore, props: PanelProps) =>
  props.keepMounted ?? state.keepMounted
const findable = (state: AccordionStore, props: PanelProps) =>
  props.hiddenUntilFound ?? state.hiddenUntilFound

// The state every part of an item shares.
const itemState = (
  state: AccordionStore,
  key: string,
  api: AccordionApi,
  own?: boolean
) => ({
  open: state.value.includes(key),
  disabled: disabledOf(state, key, api, own),
  index: state.items.indexOf(key),
})

const accordionPrimitive = /* @__PURE__ */ definePrimitive({
  name: "accordion",
  options: {
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    multiple: "boolean",
    collapsible: "boolean",
    disabled: "boolean",
    keepMounted: "boolean",
    hiddenUntilFound: "boolean",
    controller: "value",
  },
  state: (options: AccordionOptions): AccordionStore => ({
    value: options.defaultValue ?? [],
    multiple: false,
    collapsible: true,
    disabled: false,
    formDisabled: false,
    keepMounted: false,
    hiddenUntilFound: false,
    exiting: [],
    panels: [],
    items: [],
  }),
  live: ["panels", "items"],
  sync: (options) => ({
    multiple: options.multiple ?? false,
    collapsible: options.collapsible ?? true,
    disabled: options.disabled ?? false,
    keepMounted: options.keepMounted ?? false,
    hiddenUntilFound: options.hiddenUntilFound ?? false,
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: accordionApi,
  slots: (slot) => ({
    root: slot<{}, AccordionState>({
      state: (state) => ({
        value: state.value,
        disabled: isDisabled(state),
        multiple: state.multiple,
      }),
      attrs: (state) => ({
        "data-disabled": isDisabled(state) ? "" : undefined,
      }),
      bind(el, { api, store }) {
        const unwatch = watchFormDisabled(el, store)
        if (typeof MutationObserver === "undefined") {
          return unwatch
        }
        // Items moved in the page, like a sorted list, change their index without registering again.
        const observer = new MutationObserver((records) => {
          if (
            records.some(
              (record) => !api.internal.insideItem(record.target, el)
            )
          ) {
            api.internal.syncItems()
          }
        })
        observer.observe(el, { childList: true, subtree: true })
        return () => {
          observer.disconnect()
          unwatch()
        }
      },
    }),

    // Parts of an item read the open items, the exiting panels and the panels
    // in the page only for their own item, so an open reaches that item's parts.
    item: slot<ItemProps, AccordionItemState>({
      props: {
        value: "id",
        disabled: "boolean",
        onOpenChange: "callback",
        onOpenChangeComplete: "callback",
      },
      selects: selects({ value: ({ key }) => [key], exiting: [], panels: [] }),
      state: (state, { key, props, api }) =>
        itemState(state, key, api, props.disabled),
      attrs: (state, { key, props, api }) => ({
        ...openAttrs(state.value.includes(key)),
        "data-disabled": disabledOf(state, key, api, props.disabled)
          ? ""
          : undefined,
      }),
      live: live((state, { key }) => {
        const index = state.items.indexOf(key)
        return { "data-index": index === -1 ? undefined : String(index) }
      }),
      bind: (el, { api, key }) => api.internal.registerItem(key, el),
    }),

    header: slot<HeaderProps, AccordionHeaderState>({
      props: { value: { kind: "string", from: "item" } },
      selects: selects({ value: ({ key }) => [key], exiting: [], panels: [] }),
      state: (state, { key, api }) => itemState(state, key, api),
      attrs: (state, { key, api }) => ({
        ...openAttrs(state.value.includes(key)),
        "data-disabled": disabledOf(state, key, api) ? "" : undefined,
      }),
    }),

    trigger: slot<TriggerProps, AccordionTriggerState>({
      props: { value: { kind: "string", from: "item" }, disabled: "boolean" },
      selects: selects({
        value: ({ key }) => [key],
        exiting: [],
        panels: ({ key }) => [key],
      }),
      state: (state, { key, props, api }) =>
        itemState(state, key, api, props.disabled),
      attrs: (state, { id, key, props, api }) => {
        const open = state.value.includes(key)
        const disabled = disabledOf(state, key, api, props.disabled)
        return {
          id: `${id}-trigger-${idPart(key)}`,
          type: "button",
          "aria-expanded": String(open),
          // Also when the open item can't close, as the APG asks.
          "aria-disabled": disabled || locked(state, key) ? "true" : undefined,
          ...openAttrs(open),
          "data-disabled": disabled ? "" : undefined,
        }
      },
      // Only panels in the page can be pointed at.
      live: live((state, { id, key }) => ({
        "aria-controls": state.panels.includes(key)
          ? `${id}-panel-${idPart(key)}`
          : undefined,
      })),
      press({ api, el, key, props, store }, event) {
        if (disabledOf(store.get(), key, api, props.disabled)) {
          // A disabled link must not navigate either.
          event?.preventDefault()
          return
        }
        focusPressedTrigger(el)
        api.toggle(key, { reason: "trigger-press", event })
      },
      on: { keydown: (event, { el }) => triggerKeydown(event, el) },
      bind: (el) => bindTriggerElement(el),
    }),

    panel: slot<PanelProps, AccordionPanelState>({
      role: "region",
      props: {
        value: { kind: "string", from: "item" },
        keepMounted: "boolean",
        hiddenUntilFound: "boolean",
      },
      selects: selects({
        value: ({ key }) => [key],
        exiting: ({ key }) => [key],
        panels: [],
      }),
      present: (state, { key, props }) =>
        state.value.includes(key) ||
        state.exiting.includes(key) ||
        keepsMounted(state, props) ||
        findable(state, props),
      state: (state, { key, api }) => itemState(state, key, api),
      attrs: (state, { id, key, props, api }) => {
        const open = state.value.includes(key)
        return {
          id: `${id}-panel-${idPart(key)}`,
          "aria-labelledby": `${id}-trigger-${idPart(key)}`,
          ...hiddenAttrs(
            open || state.exiting.includes(key),
            findable(state, props)
          ),
          ...openAttrs(open),
          "data-disabled": disabledOf(state, key, api) ? "" : undefined,
        }
      },
      bind(el, part) {
        const { api, key, store } = part
        const unregister = api.internal.registerPanel(key)
        const unbind = bindPanel(el, {
          size(el, height, width) {
            el.style.setProperty("--accordion-panel-height", height)
            el.style.setProperty("--accordion-panel-width", width)
          },
          isOpen: () => api.isOpen(key),
          isExiting: () => store.get().exiting.includes(key),
          isFindable: () => findable(store.get(), part.props),
          opening: () => api.internal.opening(key),
          reveal: (event) => api.open(key, { reason: "find-in-page", event }),
          trigger: () => api.internal.triggerElement(key),
          subscribe: stateAndRenders(store, part),
          settled: (open) => api.internal.settled(key, open),
          exited: () => api.internal.finishExit(key),
        })
        return () => {
          unbind()
          unregister()
        }
      },
    }),
  }),
  agent: {
    actions: ["setValue", "open", "close", "toggle", "openAll", "closeAll"],
    closed: true,
    reveals: true,
  },
})
/**
 * The type of `accordion`.
 * @stable
 */
interface AccordionPrimitive extends WithGeneric<
  typeof accordionPrimitive,
  AccordionGeneric
> {}

/**
 * The accordion primitive, with the slots `root`, `item`, `header`, `trigger`,
 * `panel`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const accordion = accordionPrimitive as AccordionPrimitive

export {
  accordion,
  type AccordionApi,
  type AccordionChangeOptions,
  type AccordionController,
  type AccordionHeaderProps,
  type AccordionHeaderState,
  type AccordionItemProps,
  type AccordionItemState,
  type AccordionOptions,
  type AccordionPanelProps,
  type AccordionPanelState,
  type AccordionPrimitive,
  type AccordionState,
  type AccordionTriggerProps,
  type AccordionTriggerState,
  type AccordionValueChangeReason,
  createAccordionController,
}
