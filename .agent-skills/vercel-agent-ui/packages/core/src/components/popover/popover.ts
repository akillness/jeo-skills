import { dev, warn } from "#dev"
import {
  ariaKeyshortcuts,
  initialApple,
} from "../../foundation/platform/platform"
import {
  createPopupController,
  type Modal,
  type PopupFocusTarget,
} from "../../foundation/popups/popup"
import { modalAttribute } from "../../foundation/popups/modal-attribute"
import {
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import { type PresentationSetting } from "../../foundation/popups/presentation"
import {
  createPopup,
  popupState,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { popoverPreset } from "../../foundation/popups/popup-presets"
import {
  popupArrow,
  popupClose,
  popupContent,
  popupDescription,
  popupTitle,
  popupTrigger,
  popupViewport,
} from "../../foundation/popups/popup-slots"
import type {
  ChangeDetails,
  DismissAttemptReason,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import {
  adoptPlatform,
  bindPartShortcut,
  shortcutOf,
  shortcutSlot,
} from "../../foundation/shortcuts/shortcut-slot"
import { onProps } from "../../foundation/kernel/part"
import type { DismissOptions } from "../../foundation/popups/dismissal"

/**
 * Why a popover opened or closed.
 * @stable
 */
type PopoverOpenChangeReason =
  | "trigger-press"
  | "trigger-hover"
  | "outside-press"
  | "escape-key"
  | "focus-out"
  | "window-blur"
  | "close-press"
  | "back"
  | "shortcut"
  | "swipe"
  | "imperative"

/**
 * The dismissals `dismissible` refuses that `onDismissAttempt` hears about.
 * @stable
 */
type PopoverDismissReason = Extract<
  PopoverOpenChangeReason,
  DismissAttemptReason
>

/**
 * Why the popover's payload changed: a trigger opened it, another trigger took it over while open, or a controller opened it or gave the open one another payload.
 * @stable
 */
type PopoverPayloadChangeReason =
  "trigger-press" | "trigger-hover" | "shortcut" | "imperative"

/**
 * Opens, closes and inspects a popover from outside it: a toolbar, a hotkey,
 * a test, or triggers outside the popover. Pass it as the `controller` option.
 * `Payload` is the type of the data triggers and `open()` pass to the content,
 * and `Result` the type of `close({ returnValue })`, which `open()` resolves with.
 * @stable
 */
function createPopoverController<Payload = unknown, Result = string>() {
  return createPopupController<
    Payload,
    PopoverOpenChangeReason,
    {},
    Result,
    PopoverPayloadChangeReason
  >()
}

/**
 * A controller from `createPopoverController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type PopoverController<Payload = unknown, Result = string> = ReturnType<
  typeof createPopoverController<Payload, Result>
>

/**
 * Where focus goes when the popover opens. `"auto"` picks the first focusable
 * element, or the popover itself when it has none. `"content"` focuses the
 * popover itself and `"none"` leaves focus where it is. A CSS selector, an
 * element or a function picks a specific element.
 * @stable
 */
type PopoverInitialFocus =
  | "auto"
  | "content"
  | "none"
  | (string & {})
  | HTMLElement
  | (() => HTMLElement | null | undefined)

/**
 * Where focus goes when the popover closes while focus was inside it.
 * `"trigger"` returns it to the trigger and `"none"` leaves it. A CSS
 * selector, an element or a function picks a specific element.
 * @stable
 */
type PopoverFinalFocus = PopupFocusTarget

/**
 * The options `popover` takes. A component takes them as props on its root.
 * @stable
 */
type PopoverOptions = PortalProps & {
  /** Whether the popover is open. Pass it to control the popover. */
  open?: boolean
  /**
   * Whether the popover starts open, when uncontrolled.
   * @defaultValue false
   */
  defaultOpen?: boolean
  /** Runs when the popover wants to open or close. `details.reason` says why, and `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<PopoverOpenChangeReason>
  ) => void
  /** Runs once the popover has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /**
   * Runs when the payload the content shows changes: a trigger with another payload opens the
   * popover, or takes the open popover over, which fires no `onOpenChange`, and so does a
   * controller's `open({ payload })` on the open popover. `details.cancel()` keeps the previous payload.
   */
  onPayloadChange?: (
    payload: unknown,
    details: ChangeDetails<PopoverPayloadChangeReason>
  ) => void
  /**
   * `false`: the rest of the page stays usable, and focus leaving the popover closes it. `true`: also traps focus, locks scroll and makes the rest of the page inert, and an outside press only closes the popover. `"trap-focus"`: traps focus but leaves the page scrollable and clickable.
   * @defaultValue false, or true while it presents as a sheet
   */
  modal?: Extract<Modal, boolean | "trap-focus">
  /**
   * Whether resting the pointer on the trigger opens the popover. Pressing the trigger still opens it, so keyboard and touch users can too.
   * @defaultValue false
   */
  openOnHover?: boolean
  /**
   * Milliseconds the pointer rests on the trigger before the popover opens, with `openOnHover`.
   * @defaultValue 300
   */
  delay?: number
  /**
   * Milliseconds before the popover closes once the pointer leaves it and its trigger, with `openOnHover`.
   * @defaultValue 0
   */
  closeDelay?: number
  /**
   * How the popover presents. `"sheet"` slides it up from the bottom of the screen, where it can be swiped away, and `"auto"` does that on small touch screens. Decided each time it opens; the server renders `"popover"` for `"auto"`.
   * @defaultValue "popover"
   */
  presentation?: PresentationSetting<"popover">
  /** Opens, closes and inspects the popover from anywhere, and connects triggers outside it. Create one with `createPopoverController()`. */
  controller?: PopoverController<any>
} & DismissOptions<PopoverOpenChangeReason> &
  PrimitiveOptions

type TriggerProps = {
  /**
   * Stops the trigger from opening the popover. A native button can't be focused or pressed, unless `focusableWhenDisabled` is set.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Keeps a disabled trigger in the tab order with `aria-disabled` instead of the native attribute, so it can host a tooltip that says why. Presses still do nothing.
   * @defaultValue false
   */
  focusableWhenDisabled?: boolean
  /** Data for the content to render when this trigger opens the popover, like the row it belongs to. */
  payload?: unknown
  /** A keyboard shortcut that presses the trigger, like `"mod+i"`. `mod` is Command on Apple platforms and Control elsewhere. Sets `aria-keyshortcuts`. */
  shortcut?: string
}

type ContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the trigger the popover opens on.
     * @defaultValue "bottom"
     */
    side?: PositionProps["side"]
    /**
     * How the popover lines up with the trigger along that side.
     * @defaultValue "center"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the trigger and the popover, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the trigger, in pixels.
     * @defaultValue 0
     */
    alignOffset?: number
    /**
     * Where focus goes when the popover opens. Opening on hover never moves focus, and opening with touch focuses the popover itself so no on-screen keyboard appears.
     * @defaultValue "auto"
     */
    initialFocus?: PopoverInitialFocus
    /**
     * Where focus goes when the popover closes while focus is inside it.
     * @defaultValue "trigger"
     */
    finalFocus?: PopoverFinalFocus
    /**
     * Whether the popover stays in the page, hidden, while closed. Its content keeps its state between opens.
     * @defaultValue false
     */
    keepMounted?: boolean
    /**
     * Renders the popover where it is in the page instead of above it, inside its parent's layout and stacking, and leaves placing it to your CSS: `side`, `align` and the offsets don't apply.
     * @defaultValue false
     */
    inline?: boolean
  }

type ShortcutProps = {
  /** The keys to show. Inside a trigger, its `shortcut`. */
  shortcut?: string
}

/**
 * The props the `trigger` slot of `popover` takes.
 * @stable
 */
type PopoverTriggerProps = TriggerProps & {
  /** Connects a trigger outside the popover, like one per table row, to the popover with this controller. */
  controller?: PopoverController<any>
}
/**
 * The props the `content` slot of `popover` takes.
 * @stable
 */
type PopoverContentProps = ContentProps
/**
 * The props the `shortcut` slot of `popover` takes.
 * @stable
 */
type PopoverShortcutProps = ShortcutProps

/**
 * The state the `trigger` slot of `popover` hands `render` functions and
 * state-based class names.
 * @stable
 */
type PopoverTriggerState = {
  /** Whether the popover is open from this trigger. */
  open: boolean
  /** Set by the trigger's `disabled` prop, which stops it opening the popover. */
  disabled: boolean
}
/**
 * The state the `content` slot of `popover` hands `render` functions and
 * state-based class names.
 * @stable
 */
type PopoverContentState<Payload = unknown> = {
  /** Whether the popover is open. False while it animates out. */
  open: boolean
  /** The `modal` setting. */
  modal: boolean | "trap-focus"
  /** How it presents this time it's open. */
  presentation: "popover" | "sheet"
  /**
   * The payload of the last open, from the trigger that opened it or a
   * controller, typed as the controller's `Payload`.
   */
  payload: Payload | undefined
}
/**
 * The state the `arrow` slot of `popover` hands `render` functions and
 * state-based class names.
 * @stable
 */
type PopoverArrowState = {
  /** Whether the popover is open. False as soon as it starts closing, while it still animates out. */
  open: boolean
}
/**
 * The state the `shortcut` slot of `popover` hands `render` functions and
 * state-based class names.
 * @stable
 */
type PopoverShortcutState = {
  /** The shortcut formatted for this platform: `⌘I` on Apple platforms and `Ctrl+I` elsewhere. Empty without one. */
  text: string
}

type PopoverState = PopupState & {
  // Apple keyboard conventions for shortcut names. Neutral until the client binds.
  apple: boolean
}

/**
 * `popover`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface PopoverApi extends ReturnType<typeof popoverApiBody> {}

// A popover is `createPopup` with `popoverPreset`. What's its own: trigger shortcuts.
function popoverApiBody(
  context: PrimitiveContext<PopoverOptions, PopoverState, string>
) {
  const popup = createPopup(context, { preset: popoverPreset })
  return {
    ...popup,
    internal: Object.assign(popup.internal, {
      // The shortcut of the trigger an element sits in or beside.
      shortcutOf: (el: HTMLElement) =>
        shortcutOf(context, "trigger", el, { beside: true }),
    }),
  }
}

const popoverApi: (...args: Parameters<typeof popoverApiBody>) => PopoverApi =
  popoverApiBody

const popoverPrimitive = /* @__PURE__ */ definePrimitive({
  name: "popover",
  options: {
    container: "value",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    onPayloadChange: "callback",
    modal: modalAttribute,
    openOnHover: "boolean",
    delay: "number",
    closeDelay: "number",
    presentation: "string",
    controller: "value",
    dismissible: "boolean",
    onDismissAttempt: "callback",
  },
  state: (options: PopoverOptions): PopoverState => ({
    ...popupState(options),
    apple: initialApple(),
  }),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: popoverApi,
  slots: (slot) => {
    const trigger = popupTrigger(slot)
    const content = popupContent(slot)
    return {
      // A popup trigger whose `shortcut` presses it.
      trigger: slot<TriggerProps, PopoverTriggerState>({
        props: {
          id: "id",
          disabled: "boolean",
          focusableWhenDisabled: "boolean",
          payload: "value",
          shortcut: "string",
        },
        state: trigger.state,
        attrs: (state, part) => ({
          ...trigger.attrs!(state, part),
          "aria-keyshortcuts": part.props.shortcut
            ? ariaKeyshortcuts(part.props.shortcut, state.apple)
            : undefined,
        }),
        on: trigger.on,
        press: trigger.press,
        bind(el, part) {
          const { api, key } = part
          const unbind = trigger.bind!(el, part)
          adoptPlatform(part.store)
          const offShortcut = bindPartShortcut(
            () => part.props.shortcut,
            (event) => {
              if (part.props.disabled) {
                return
              }
              if (api.isOpen()) {
                api.internal.control.hide({ reason: "shortcut", event })
              } else {
                api.internal.control.show({
                  event,
                  by: "keyboard",
                  reason: "shortcut",
                  trigger: key,
                  payload: part.props.payload,
                })
              }
            },
            { layer: el },
            (listener) => onProps(part, listener)
          )
          return () => {
            offShortcut()
            unbind?.()
          }
        },
      }),
      // `createPopup`'s content, with the state Popover documents: it's never
      // `"pointer"` modal, and presents as a popover or a sheet.
      content: slot<ContentProps, PopoverContentState>({
        ...content,
        props: { ...content.props, inline: "boolean" },
        bind(el, part) {
          // Only a form inside nests. Other fields in a popover belong to the
          // form around it, like any field in place.
          if (
            dev &&
            el.querySelector("form") &&
            el.parentElement?.closest("form")
          ) {
            warn(
              "The content renders inside a form, which nests forms. Pass `container` to render it elsewhere.",
              { component: "popover", id: part.id }
            )
          }
          return content.bind!(el, part)
        },
        state: (state) => ({
          open: state.open,
          modal: state.modal as PopoverContentState["modal"],
          presentation:
            state.presentation as PopoverContentState["presentation"],
          payload: state.payload,
        }),
      }),
      viewport: popupViewport(slot),
      title: popupTitle(slot),
      description: popupDescription(slot),
      close: popupClose(slot),
      arrow: popupArrow(slot),
      // Without keys of its own, it shows the shortcut of the trigger it sits in.
      shortcut: shortcutSlot(
        slot,
        (_state, api, el) => el && api.internal.shortcutOf(el)
      ),
    }
  },
  agent: { actions: ["setOpen"] },
})

/**
 * The type of `popover`.
 * @stable
 */
interface PopoverPrimitive extends Named<typeof popoverPrimitive> {}

/**
 * The popover primitive, with the slots `trigger`, `content`, `viewport`,
 * `title`, `description`, `close`, `arrow`, `shortcut`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const popover: PopoverPrimitive = popoverPrimitive

export {
  createPopoverController,
  popover,
  popoverPreset,
  type PopoverApi,
  type PopoverArrowState,
  type PopoverContentProps,
  type PopoverContentState,
  type PopoverController,
  type PopoverDismissReason,
  type PopoverFinalFocus,
  type PopoverInitialFocus,
  type PopoverOpenChangeReason,
  type PopoverOptions,
  type PopoverPayloadChangeReason,
  type PopoverPrimitive,
  type PopoverShortcutProps,
  type PopoverShortcutState,
  type PopoverTriggerProps,
  type PopoverTriggerState,
}
