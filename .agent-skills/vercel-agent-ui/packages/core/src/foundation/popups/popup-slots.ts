// The parts every popup has: one builder each, and `popupSlots` for all of
// them. A popup that renders only some takes those builders, so it bundles
// only those. They read the preset, the role and everything they call from
// the api `createPopup` returns, so they take no preset of their own.
import { dev } from "#dev"
import { checkName } from "#name-check"
import { flagWhileBound, settleFlag } from "../kernel/bound-keys"
import { openAttrs } from "../kernel/attrs"
import { onProps } from "../kernel/part"
import type { Part, SlotFactory } from "../kernel/primitive-types"
import type { Store } from "../kernel/store"
import type { PortalProps, PositionProps } from "../platform/position"
import { popupContentAttrs, type Modal, type PopupFocusTarget } from "./popup"
import { ownsEvent, registerPopupElement } from "./popup-elements"
import type { createPopup, PopupState } from "./create-popup"

/**
 * The props a popup's `trigger` takes.
 * @experimental
 */
type PopupTriggerProps = {
  /**
   * Stops the trigger from opening the popup. A native button can't be focused or pressed, unless `focusableWhenDisabled` is set.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Keeps a disabled trigger in the tab order with `aria-disabled` instead of the native attribute, so it can host a tooltip that says why. Presses still do nothing.
   * @defaultValue false
   */
  focusableWhenDisabled?: boolean
  /** Data for the content to render when this trigger opens the popup, like the row it belongs to. */
  payload?: unknown
}

/**
 * The props a popup's `content` takes.
 * @experimental
 */
type PopupContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the trigger the popup opens on. A dialog isn't placed beside its trigger.
     * @defaultValue "bottom", or "top" for a tooltip
     */
    side?: PositionProps["side"]
    /**
     * How the popup lines up with the trigger along that side.
     * @defaultValue "center"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the trigger and the popup, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the trigger, in pixels.
     * @defaultValue 0
     */
    alignOffset?: number
    /**
     * Where focus goes when the popup opens. `"auto"` picks the first focusable element, or the
     * popup itself when it has none, `"content"` focuses the popup and `"none"` leaves focus where
     * it is. A CSS selector, an element or a function picks a specific element. Opening on hover
     * never moves focus, opening with touch focuses the popup itself so no on-screen keyboard
     * appears, and hover presets never take focus.
     * @defaultValue "auto"
     */
    initialFocus?:
      | "auto"
      | "content"
      | "none"
      | (string & {})
      | HTMLElement
      | (() => HTMLElement | null | undefined)
    /**
     * Where focus goes when the popup closes while focus is inside it. `"trigger"` returns it to
     * the trigger and `"none"` leaves it.
     * @defaultValue "trigger"
     */
    finalFocus?: PopupFocusTarget
    /**
     * Whether the popup stays in the page, hidden, while closed. Its content keeps its state between opens.
     * @defaultValue false
     */
    keepMounted?: boolean
  }

/**
 * The state a popup's `trigger` hands `render` functions and state-based class names.
 * @experimental
 */
type PopupTriggerState = {
  /** Whether the popup is open from this trigger. */
  open: boolean
  /** Set by the trigger's `disabled` prop, which stops it opening the popup. */
  disabled: boolean
}

/**
 * The state a popup's `content` hands `render` functions and state-based class names.
 * @experimental
 */
type PopupContentState = {
  /** Whether the popup is open. False while it animates out. */
  open: boolean
  /** The `modal` in effect: the option, else the preset's, else true while it presents as a sheet. */
  modal: Modal
  /** How it presents this time it's open. */
  presentation: "popover" | "dialog" | "sheet"
  /** The payload of the last open, from the trigger that opened it or a controller. */
  payload: unknown
}

/**
 * The state a popup's `arrow` and `backdrop` hand `render` functions and state-based class names.
 * @experimental
 */
type PopupPartState = {
  /** Whether the popup is open. False as soon as it starts closing, while it still animates out. */
  open: boolean
}

// What the parts call. A primitive spreads `createPopup`'s api into its own.
type PopupInternal = ReturnType<typeof createPopup>["internal"]
type PopupApi = { isOpen: () => boolean; internal: PopupInternal }

// Keys on a trigger: Enter and Space on one that isn't a button, and Tab into
// an open popup, unless the feature that opens it handles them.
function triggerKeydown(
  internal: PopupInternal,
  event: KeyboardEvent,
  el: HTMLElement,
  key: string,
  props: PopupTriggerProps
) {
  if (
    internal.press?.keydown(event, el, key, props) ||
    internal.focus?.keydown(event)
  ) {
    return
  }
  internal.popup.triggerKeydown(event)
}

// Keys from a popup nested in this one bubble through it. Only the owner handles them.
function contentKeydown(
  internal: PopupInternal,
  event: KeyboardEvent,
  el: HTMLElement
) {
  if (ownsEvent(el, event)) {
    internal.popup.keydown(event)
  }
}

// Shows the content when the popup opens: placed beside its anchor when the
// preset places it, with focus moving in when a press opens it, and as a
// sheet when it presents as one. Components with their own content part bind it here too.
function bindPopupContent(
  el: HTMLElement,
  internal: PopupInternal,
  key?: string,
  part?: Part
) {
  const {
    preset,
    control,
    contentProps,
    triggerElement,
    element,
    popup,
    press,
    rules,
    presentation,
  } = internal
  const { placement } = preset
  preset.resetStyles?.bind(el)
  // Dialog and Popover content take it.
  const inline = !!(contentProps(key) as { inline?: boolean }).inline
  return (presentation ?? popup).bind(el, {
    inline,
    // What it's placed against: a controller's anchor, the content's, or the trigger.
    anchor: () =>
      control.anchor() ??
      placement?.anchor(el, contentProps().anchor, triggerElement),
    // Props are read on every check, so a new side applies while open.
    position:
      placement && !inline
        ? () =>
            placement.options(
              contentProps(key),
              { side: preset.side, align: "center" },
              element("arrow")
            )
        : undefined,
    rendered: part && ((listener) => onProps(part, listener)),
    // Where focus goes once the popup and its children have bound. Hover content takes none.
    initialFocus:
      press &&
      (() =>
        press.initialFocus(
          popup.element()!,
          contentProps().initialFocus,
          rules?.preferredFocus
        )),
    backdrop: () => element("backdrop"),
    ...rules?.bind?.(),
  })
}

// The first trigger is the one focus returns to until another opens the popup.
function bindTrigger<State extends PopupState>(
  store: Store<State>,
  key: string
) {
  if (store.get().trigger === null) {
    store.set({ trigger: key } as Partial<State>)
  }
  return () => {
    if (store.get().trigger === key && !store.get().open) {
      store.set({ trigger: null } as Partial<State>)
    }
  }
}

/**
 * A popup's `trigger`. A press opens the popup for most presets; resting the
 * pointer or keyboard focus does for `tooltipPreset` and `hoverCardPreset`,
 * whose trigger is often a link and keeps its own role. Several triggers can
 * share one popup, each handing the content its `payload`. Part of `popupSlots`.
 * @experimental
 */
function popupTrigger<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return slot<PopupTriggerProps, PopupTriggerState>({
    props: {
      id: "id",
      disabled: "boolean",
      focusableWhenDisabled: "boolean",
      payload: "value",
    },
    state: (state, { key, props }) => ({
      open: state.open && (state.trigger === null || state.trigger === key),
      disabled: !!props.disabled,
    }),
    // What the trigger says it opens comes from the feature that opens it: a
    // press's button, or a hover's link that a tooltip describes.
    attrs: (state, { id, key, props, api }) => {
      const { press, focus, role } = api.internal
      return (press ?? focus)?.triggerAttrs(state, id, key, props, role) ?? {}
    },
    on: {
      pointerenter: (event, { api, key, props }) =>
        !props.disabled && api.internal.hover?.enter(event, key, props.payload),
      pointerleave: (event, { api }) => api.internal.hover?.leave(event),
      focusin: (event, { api, key, props }) =>
        !props.disabled && api.internal.focus?.enter(key, props.payload, event),
      focusout: (event, { api }) => api.internal.focus?.leave(event),
      keydown: (event, { api, el, key, props }) =>
        el && triggerKeydown(api.internal, event, el, key, props),
    },
    press: ({ api, key, props }, event) =>
      api.internal.press?.press(key, props, event),
    bind(el, { api, key, id, store }) {
      if (dev) {
        checkName(el, "The trigger", { component: api.internal.label, id })
      }
      return bindTrigger(store, key)
    },
  })
}

/**
 * A popup's `content`: the popup itself, with the preset's role, named by its
 * title or else its trigger, described by its description, and placed beside
 * the trigger unless the preset is a dialog. A tooltip's stays in the page,
 * hidden while closed, so its trigger is described before focus reaches it.
 * Part of `popupSlots`.
 * @experimental
 */
function popupContent<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return slot<PopupContentProps, PopupContentState>({
    props: {
      side: "string",
      align: "string",
      sideOffset: "number",
      alignOffset: "number",
      collisionPadding: "number",
      container: "value",
      arrowPadding: "number",
      anchor: "string",
      initialFocus: "string",
      finalFocus: "string",
      keepMounted: "boolean",
    },
    connect: registerPopupElement,
    role: (state, { api }) => api.internal.role,
    roles: ["dialog", "alertdialog", "menu", "tooltip"],
    // Only Tab: a menu built on these parts brings its own arrow keys.
    keys: ["Tab"],
    state: (state) => ({
      open: state.open,
      modal: state.modal,
      presentation: state.presentation,
      payload: state.payload,
    }),
    present: (state, { props, api }) =>
      state.mounted || !!props.keepMounted || api.internal.role === "tooltip",
    attrs: (state, { id, api }) => {
      const { role, press, triggerName } = api.internal
      return {
        ...popupContentAttrs(state, id),
        // A tooltip never takes focus, so it needs no tabindex.
        tabindex: role === "tooltip" ? undefined : "-1",
        ...press?.contentAttrs(state, id, role),
        ...triggerName?.contentAttrs(state, id),
      }
    },
    on: {
      keydown: (event, { api, el }) =>
        el && contentKeydown(api.internal, event, el),
      pointerenter: (event, { api }) => api.internal.hover?.enter(event),
      pointerleave: (event, { api }) => api.internal.hover?.leaveContent(event),
    },
    bind(el, part) {
      settleFlag(part.store, "titled")
      return bindPopupContent(el, part.api.internal, part.key, part)
    },
  })
}

/**
 * A popup's `viewport`: the full-screen element a popup presented as a sheet
 * sits in. Renderers render it around the content only then. Part of `popupSlots`.
 * @experimental
 */
function popupViewport<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return slot({ present: (state) => state.presentation === "sheet" })
}

/**
 * A popup's `title`, which names it while it renders. Part of `popupSlots`.
 * @experimental
 */
function popupTitle<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return slot({
    attrs: (state, { id }) => ({ id: `${id}-title` }),
    bind: (el, { store }) => flagWhileBound(store, "titled", { now: true }),
  })
}

/**
 * A popup's `description`, which describes it while it renders. Part of `popupSlots`.
 * @experimental
 */
function popupDescription<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return slot({
    attrs: (state, { id }) => ({ id: `${id}-description` }),
    bind: (el, { store }) => flagWhileBound(store, "described", { now: true }),
  })
}

/**
 * A popup's `close` button, which closes it with reason `close-press`. Part of `popupSlots`.
 * @experimental
 */
function popupClose<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return slot({
    attrs: () => ({ type: "button" }),
    press: ({ api }, event) =>
      api.internal.control.hide({ reason: "close-press", event }),
  })
}

/**
 * A popup's `arrow`, which points at the trigger. Part of `popupSlots`.
 * @experimental
 */
function popupArrow<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return slot<{}, PopupPartState>({
    state: (state) => ({ open: state.open }),
    attrs: (state) => ({ "aria-hidden": "true", ...openAttrs(state.open) }),
    // An arrow that binds after its popup was placed, like one Svelte binds
    // after the content, points at the trigger at once.
    bind(_, { api }) {
      api.internal.popup.checkPlacement()
    },
  })
}

/**
 * A popup's `backdrop`, beneath it in the top layer and shown and hidden with
 * it. A press on it is an outside press. Part of `popupSlots`.
 * @experimental
 */
function popupBackdrop<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return slot<{}, PopupPartState>({
    state: (state) => ({ open: state.open }),
    present: (state, { api }) =>
      state.mounted || !!api.internal.contentProps().keepMounted,
    role: "presentation",
    attrs: (state) => ({
      hidden: state.mounted ? undefined : "",
      ...openAttrs(state.open),
    }),
    bind(el, { api }) {
      api.internal.preset.resetStyles?.bind(el)
      return api.internal.popup.backdrop(el)
    },
  })
}

/**
 * Every part a popup has, to spread into a primitive's `slots` beside
 * `createPopup`: `trigger`, `content`, `title`, `description`, `close`,
 * `arrow`, `backdrop` and `viewport`. A popup that renders only some takes
 * those builders instead, like `popupTrigger(slot)`, so it doesn't bundle the
 * rest. A slot of the same name after the spread replaces one.
 *
 * @example
 * slots: (slot) => ({
 *   ...popupSlots(slot),
 *   image: slot({ attrs: (state) => ({ src: (state.payload as { image: string }).image, alt: "" }) }),
 * })
 *
 * @experimental
 */
function popupSlots<State extends PopupState, Api extends PopupApi>(
  slot: SlotFactory<State, Api>
) {
  return {
    trigger: popupTrigger(slot),
    content: popupContent(slot),
    viewport: popupViewport(slot),
    title: popupTitle(slot),
    description: popupDescription(slot),
    close: popupClose(slot),
    arrow: popupArrow(slot),
    backdrop: popupBackdrop(slot),
  }
}

export {
  bindPopupContent,
  bindTrigger,
  popupArrow,
  popupBackdrop,
  popupClose,
  popupContent,
  type PopupContentProps,
  type PopupContentState,
  popupDescription,
  type PopupPartState,
  popupSlots,
  popupTitle,
  popupTrigger,
  type PopupTriggerProps,
  type PopupTriggerState,
  popupViewport,
}
