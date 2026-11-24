import {
  bindPanel,
  bindTriggerElement,
  createPendingReason,
  focusPressedTrigger,
  hiddenAttrs,
  openAttrs,
  triggerKeydown,
} from "../../foundation/disclosure/disclosure"
import { isDisabled, watchFormDisabled } from "../../foundation/forms/form"
import { stateAndRenders } from "../../foundation/motion/panel"
import { settleFlag } from "../../foundation/kernel/bound-keys"
import { createController } from "../../foundation/kernel/controller"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { direct } from "../../foundation/kernel/live"
import { createChange } from "../../foundation/kernel/input-source"

/**
 * Why a collapsible opened or closed: its trigger was pressed, find in page
 * matched text in its closed panel, or a controller or `api` call changed it.
 * @stable
 */
type CollapsibleOpenChangeReason =
  "trigger-press" | "find-in-page" | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type CollapsibleChangeOptions = ChangeOptions<CollapsibleOpenChangeReason>

/**
 * Opens and closes a collapsible from outside it. Pass it as the `controller` option.
 * @stable
 */
function createCollapsibleController() {
  return createController<{
    /** Whether the panel is open. */
    isOpen: () => boolean
    /** Opens or closes the panel. Returns false when the change was canceled or not possible. */
    setOpen: (open: boolean, options?: CollapsibleChangeOptions) => boolean
    /** Opens the panel. */
    open: (options?: CollapsibleChangeOptions) => boolean
    /** Closes the panel. */
    close: (options?: CollapsibleChangeOptions) => boolean
    /** Opens the panel when it's closed, and closes it when it's open. */
    toggle: (options?: CollapsibleChangeOptions) => boolean
    /** Moves focus to the trigger. */
    focus: () => void
  }>()
}

/**
 * A controller from `createCollapsibleController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type CollapsibleController = ReturnType<typeof createCollapsibleController>

/**
 * The options `collapsible` takes. A component takes them as props on its
 * root.
 * @stable
 */
type CollapsibleOptions = {
  /** Whether the panel is open. Pass it to control the collapsible. */
  open?: boolean
  /**
   * Whether the panel is open at first, when uncontrolled.
   * @defaultValue false
   */
  defaultOpen?: boolean
  /** Runs when the panel wants to open or close. `details.reason` says why, and `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<CollapsibleOpenChangeReason>
  ) => void
  /** Runs once the panel has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /**
   * Stops the trigger from opening or closing the panel. The trigger stays focusable.
   * @defaultValue false
   */
  disabled?: boolean
  /** Opens and closes the panel from anywhere. Create one with `createCollapsibleController()`. */
  controller?: CollapsibleController
} & PrimitiveOptions

/**
 * The props the `panel` slot of `collapsible` takes.
 * @stable
 */
type CollapsiblePanelProps = {
  /**
   * Whether the panel stays in the page, hidden, while closed.
   * @defaultValue false
   */
  keepMounted?: boolean
  /**
   * Keeps the closed panel in the page as `hidden="until-found"`, so the
   * browser's find in page can match its text and open it.
   * @defaultValue false
   */
  hiddenUntilFound?: boolean
}

/**
 * The props the `trigger` slot of `collapsible` takes.
 * @stable
 */
type CollapsibleTriggerProps = {}

/**
 * What `render` functions and state-based class names receive on every part.
 * @stable
 */
type CollapsibleState = {
  /** Whether the panel is open. */
  open: boolean
  /** Whether the trigger ignores presses, by its own `disabled` or a disabled fieldset around it. The `open` option and the controller can still open and close it. */
  disabled: boolean
}
/**
 * The state the `trigger` slot of `collapsible` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CollapsibleTriggerState = CollapsibleState
/**
 * The state the `panel` slot of `collapsible` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CollapsiblePanelState = CollapsibleState

type Cause = { reason?: CollapsibleOpenChangeReason; event?: Event }

/**
 * `collapsible`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
type CollapsibleApi = ReturnType<typeof collapsible>["api"]

const collapsiblePrimitive = /* @__PURE__ */ definePrimitive({
  name: "collapsible",
  options: {
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    disabled: "boolean",
    controller: "value",
  },
  state: (options: CollapsibleOptions) => ({
    open: options.defaultOpen ?? false,
    disabled: false,
    formDisabled: false,
    // Shown while it animates out.
    exiting: false,
    // Whether the panel is in the page, so the trigger can point at it. Null
    // until the trigger binds, like on a server, where an open one is.
    panel: null as boolean | null,
  }),
  sync: (options) => ({
    disabled: options.disabled ?? false,
    ...(options.open === undefined ? {} : { open: options.open }),
  }),
  api(context) {
    const { id, store, options, element } = context
    const change = createChange(context)
    // Why the panel opened after mount, until it settles. Undefined while it's
    // open from the first paint, so it doesn't animate.
    let openedBy: CollapsibleOpenChangeReason | undefined
    const reason =
      createPendingReason<CollapsibleOpenChangeReason>("imperative")

    // A panel in the page animates out before it goes, in the same pass as a
    // closing `open` from options.
    deriveFromOptions(context, ["exiting"], (synced, state) =>
      "open" in synced && synced.open !== state.open
        ? { exiting: !synced.open && state.panel === true }
        : undefined
    )
    let previous = store.get().open
    store.subscribe(() => {
      const { open } = store.get()
      if (open === previous) {
        return
      }
      previous = open
      // A later value from options, like a parent's own toggle, isn't this change.
      const why = reason.take()
      openedBy = open ? why : undefined
      // A panel in the page animates out before it goes.
      store.set({ exiting: !open && store.get().panel === true })
    })

    function setOpen(
      open: boolean,
      { reason: why = "imperative", event }: Cause = {}
    ) {
      if (store.get().open === open) {
        return false
      }
      reason.set(why)
      const changed = change("open", open, { reason: why, event })
      if (!changed) {
        reason.take()
      }
      return changed
    }

    return {
      id,
      options,
      isOpen: () => store.get().open,
      setOpen,
      open: (cause?: Cause) => setOpen(true, cause),
      close: (cause?: Cause) => setOpen(false, cause),
      toggle: (cause?: Cause) => setOpen(!store.get().open, cause),
      focus: () => element("trigger")?.focus(),
      internal: {
        triggerElement: () => element("trigger"),
        // Find in page shows its match at once, without an animation.
        opening: () =>
          openedBy === undefined
            ? ("mount" as const)
            : openedBy === "find-in-page"
              ? ("instant" as const)
              : ("animate" as const),
        registerPanel() {
          store.set({ panel: true })
          return () => store.set({ panel: false, exiting: false })
        },
        exited: () => store.set({ exiting: false }),
        settled(open: boolean) {
          openedBy = undefined
          options().onOpenChangeComplete?.(open)
        },
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, CollapsibleState>({
      state: (state) => ({ open: state.open, disabled: isDisabled(state) }),
      attrs: (state) => ({
        ...openAttrs(state.open),
        "data-disabled": isDisabled(state) ? "" : undefined,
      }),
      bind: (el, { store }) => watchFormDisabled(el, store),
    }),

    trigger: slot<CollapsibleTriggerProps, CollapsibleTriggerState>({
      state: (state) => ({ open: state.open, disabled: isDisabled(state) }),
      attrs: (state, { id }) => ({
        id: `${id}-trigger`,
        type: "button",
        "aria-expanded": String(state.open),
        "aria-controls":
          (state.panel ?? state.open) ? `${id}-panel` : undefined,
        "aria-disabled": isDisabled(state) ? "true" : undefined,
        ...openAttrs(state.open),
        "data-disabled": isDisabled(state) ? "" : undefined,
      }),
      // The panel coming and going moves the reference without rendering the trigger again.
      direct: direct(["aria-controls"]),
      press({ api, el, store }, event) {
        if (isDisabled(store.get())) {
          // A disabled link must not navigate either.
          event?.preventDefault()
          return
        }
        focusPressedTrigger(el)
        api.toggle({ reason: "trigger-press", event })
      },
      on: { keydown: (event, { el }) => triggerKeydown(event, el) },
      bind(el, { store }) {
        settleFlag(store, "panel")
        return bindTriggerElement(el)
      },
    }),

    panel: slot<CollapsiblePanelProps, CollapsiblePanelState>({
      props: { keepMounted: "boolean", hiddenUntilFound: "boolean" },
      present: (state, { props }) =>
        state.open ||
        state.exiting ||
        !!props.keepMounted ||
        !!props.hiddenUntilFound,
      state: (state) => ({ open: state.open, disabled: isDisabled(state) }),
      attrs: (state, { id, props }) => ({
        id: `${id}-panel`,
        ...hiddenAttrs(state.open || state.exiting, !!props.hiddenUntilFound),
        ...openAttrs(state.open),
        "data-disabled": isDisabled(state) ? "" : undefined,
      }),
      bind(el, part) {
        const { api, store } = part
        const unregister = api.internal.registerPanel()
        const unbind = bindPanel(el, {
          size(el, height, width) {
            el.style.setProperty("--collapsible-panel-height", height)
            el.style.setProperty("--collapsible-panel-width", width)
          },
          isOpen: () => store.get().open,
          isExiting: () => store.get().exiting,
          isFindable: () => !!part.props.hiddenUntilFound,
          opening: api.internal.opening,
          reveal: (event) => api.open({ reason: "find-in-page", event }),
          trigger: api.internal.triggerElement,
          subscribe: stateAndRenders(store, part),
          settled: api.internal.settled,
          exited: api.internal.exited,
        })
        return () => {
          unbind()
          unregister()
        }
      },
    }),
  }),
  agent: { actions: ["setOpen"] },
})

/**
 * The type of `collapsible`.
 * @stable
 */
interface CollapsiblePrimitive extends Named<typeof collapsiblePrimitive> {}

/**
 * The collapsible primitive, with the slots `root`, `trigger`, `panel`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const collapsible: CollapsiblePrimitive = collapsiblePrimitive

export {
  collapsible,
  type CollapsibleApi,
  type CollapsibleChangeOptions,
  type CollapsibleController,
  type CollapsibleOpenChangeReason,
  type CollapsibleOptions,
  type CollapsiblePanelProps,
  type CollapsiblePanelState,
  type CollapsiblePrimitive,
  type CollapsibleState,
  type CollapsibleTriggerProps,
  type CollapsibleTriggerState,
  createCollapsibleController,
}
