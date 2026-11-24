import { dev, warn } from "#dev"
import { checkName, nameFrom } from "#name-check"
import { trackInput } from "../../foundation/kernel/modality"
import { announce } from "../../foundation/platform/announce"
import {
  ariaKeyshortcuts,
  initialApple,
} from "../../foundation/platform/platform"
import {
  createPopupController,
  openerOf,
  popupContentAttrs,
} from "../../foundation/popups/popup"
import {
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import { textOf } from "../../foundation/text/typeahead"
import {
  createPopup,
  popupState,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { tooltipPreset } from "../../foundation/popups/popup-hover-presets"
import {
  bindTrigger,
  popupArrow,
  popupContent,
  popupTrigger,
} from "../../foundation/popups/popup-slots"
import type { ChangeDetails } from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import {
  adoptPlatform,
  shortcutSlot,
} from "../../foundation/shortcuts/shortcut-slot"

/**
 * Why a tooltip opened or closed.
 * @stable
 */
type TooltipOpenChangeReason =
  | "trigger-hover"
  | "trigger-focus"
  | "trigger-press"
  | "focus-out"
  | "escape-key"
  | "close-press"
  | "outside-press"
  | "window-blur"
  | "back"
  | "imperative"

/**
 * Why the tooltip's payload changed: a trigger opened it, another trigger took it over while open, or a controller opened it or gave the open one another payload.
 * @stable
 */
type TooltipPayloadChangeReason =
  "trigger-hover" | "trigger-focus" | "trigger-press" | "imperative"

/**
 * Opens, closes and inspects a tooltip from outside it, and connects triggers
 * outside it, like one tooltip for every row of a table. Pass it as the
 * `controller` option. `Payload` is the type of the data triggers and `open()`
 * pass to the content.
 * @stable
 */
function createTooltipController<Payload = unknown>() {
  return createPopupController<
    Payload,
    TooltipOpenChangeReason,
    {},
    string,
    TooltipPayloadChangeReason
  >()
}

/**
 * A controller from `createTooltipController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type TooltipController<Payload = unknown> = ReturnType<
  typeof createTooltipController<Payload>
>

/**
 * The options `tooltip` takes. A component takes them as props on its root.
 * @stable
 */
type TooltipOptions = PortalProps & {
  /** Whether the tooltip is open. Pass it to control the tooltip. */
  open?: boolean
  /**
   * Whether the tooltip starts open, when uncontrolled.
   * @defaultValue false
   */
  defaultOpen?: boolean
  /** Runs when the tooltip wants to open or close. `details.reason` says why, and `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<TooltipOpenChangeReason>
  ) => void
  /** Runs once the tooltip has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /**
   * Runs when the payload the content shows changes: a trigger with another payload opens the
   * tooltip, or takes the open tooltip over, which fires no `onOpenChange`, and so does a
   * controller's `open({ payload })` on the open tooltip. `details.cancel()` keeps the previous payload.
   */
  onPayloadChange?: (
    payload: unknown,
    details: ChangeDetails<TooltipPayloadChangeReason>
  ) => void
  /**
   * Milliseconds the pointer rests on the trigger before the tooltip opens. While another tooltip
   * is open, or was a moment ago, the next one opens at once, without a provider.
   * @defaultValue 600
   */
  delay?: number
  /**
   * Milliseconds before the tooltip closes once the pointer leaves the trigger and the tooltip.
   * @defaultValue 0
   */
  closeDelay?: number
  /**
   * Stops the tooltip from opening. The trigger keeps working.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Whether pressing the trigger opens and closes the tooltip, so touch screens can show it too.
   * For info buttons whose only job is the tip. The text is announced when a press opens it.
   * @defaultValue false
   */
  toggleable?: boolean
  /**
   * Whether pressing the trigger closes the tooltip. Set it to `false` to keep it open, like for a
   * copy button whose tooltip turns into "Copied".
   * @defaultValue true
   */
  closeOnPress?: boolean
  /**
   * Whether the tooltip names its trigger (`"label"`) or adds a description to it
   * (`"description"`). By default it names a trigger that has no name of its own, like an icon
   * button, and describes any other.
   */
  type?: "label" | "description"
  /**
   * The keyboard shortcut of what the trigger does, like `"mod+s"`, as a hint. A `TooltipShortcut`
   * shows it, and the trigger gets `aria-keyshortcuts`. It doesn't bind the keys: the trigger's own
   * `shortcut`, or `registerShortcut`, does.
   */
  shortcut?: string
  /** Opens, closes and inspects the tooltip from anywhere, and connects triggers outside it. Create one with `createTooltipController()`. */
  controller?: TooltipController<any>
} & PrimitiveOptions

type TriggerProps = {
  /** Data for the content to render when this trigger opens the tooltip, like the row it belongs to. */
  payload?: unknown
}

type ContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the trigger the tooltip opens on.
     * @defaultValue "top"
     */
    side?: PositionProps["side"]
    /**
     * How the tooltip lines up with the trigger along that side.
     * @defaultValue "center"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the trigger and the tooltip, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the trigger, in pixels.
     * @defaultValue 0
     */
    alignOffset?: number
  }

type ShortcutProps = {
  /** The keys to show. By default, the tooltip's `shortcut`. */
  shortcut?: string
}

/**
 * The props the `trigger` slot of `tooltip` takes.
 * @stable
 */
type TooltipTriggerProps = TriggerProps & {
  /** Connects a trigger outside the tooltip, like one per table row, to the tooltip with this controller. */
  controller?: TooltipController<any>
}
/**
 * The props the `content` slot of `tooltip` takes.
 * @stable
 */
type TooltipContentProps = ContentProps
/**
 * The props the `shortcut` slot of `tooltip` takes.
 * @stable
 */
type TooltipShortcutProps = ShortcutProps

/**
 * The state the `trigger` slot of `tooltip` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TooltipTriggerState = {
  /** Whether the tooltip is open from this trigger. */
  open: boolean
}
/**
 * The state the `content` slot of `tooltip` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TooltipContentState<Payload = unknown> = {
  /** Whether the tooltip is open. False while it animates out. */
  open: boolean
  /** Whether it opened at once, because another tooltip was open a moment ago. Animations can skip. */
  instant: boolean
  /**
   * The payload of the last open, from the trigger that opened it or a
   * controller, typed as the controller's `Payload`.
   */
  payload: Payload | undefined
}
/**
 * The state the `arrow` slot of `tooltip` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TooltipArrowState = {
  /** Whether the tooltip is open. False as soon as it starts closing, while it still animates out. */
  open: boolean
}
/**
 * The state the `shortcut` slot of `tooltip` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TooltipShortcutState = {
  /** The shortcut formatted for this platform: `⌘S` on Apple platforms and `Ctrl+S` elsewhere. Empty without one. */
  text: string
}

type TooltipState = PopupState & {
  // Opened without its delay, because another tooltip was warm.
  instant: boolean
  // Whether the first trigger has a name of its own. Unknown until the client binds.
  unnamed: boolean
  // From options, since they change what the trigger renders.
  type: "label" | "description" | undefined
  shortcut: string | undefined
  // Apple keyboard conventions for shortcut names. Neutral until the client binds.
  apple: boolean
}

// Whether the tooltip names its trigger rather than describes it.
const labels = (state: TooltipState) =>
  (state.type ?? (state.unnamed ? "label" : "description")) === "label"

// Whether a trigger has a name without the tooltip: text, a label, or a title.
function hasOwnName(el: HTMLElement, contentId: string) {
  const labelledby = el.getAttribute("aria-labelledby")
  return (
    !!el.getAttribute("aria-label")?.trim() ||
    (!!labelledby && labelledby !== contentId) ||
    !!el.getAttribute("title")?.trim() ||
    !!textOf(el).trim() ||
    !!el.querySelector("img[alt]:not([alt=''])")
  )
}

// The content's text as a screen reader hears it open: without the parts
// hidden from it, like a shortcut's keys, even while the content is hidden.
// `textOf` reads past the content's own `hidden`, and skips hidden parts inside it.
const spokenText = (content: HTMLElement) =>
  textOf(content).replace(/\s+/g, " ").trim()

// A closed tooltip's content is hidden, and hidden content names or describes
// its trigger in full, so an icon button whose tooltip shows "Save ⌘S" was
// named "Save⌘S", though `aria-keyshortcuts` announces the keys. While the two
// differ, the content carries its spoken text as its `aria-label`, which the
// trigger's name and description read instead. An `aria-label` passed to the content wins.
function labelContent(el: HTMLElement) {
  let written: string | null = null
  const write = () => {
    const current = el.getAttribute("aria-label")
    if (current !== null && current !== written) {
      return
    }
    const spoken = spokenText(el)
    const label =
      spoken === (el.textContent ?? "").replace(/\s+/g, " ").trim()
        ? null
        : spoken
    if (label === written) {
      return
    }
    written = label
    if (label === null) {
      el.removeAttribute("aria-label")
    } else {
      el.setAttribute("aria-label", label)
    }
  }
  write()
  // Content changes with a payload, and a shortcut part writes its keys once it binds.
  const observer = new MutationObserver(write)
  observer.observe(el, {
    subtree: true,
    childList: true,
    characterData: true,
    attributeFilter: ["aria-hidden", "hidden"],
  })
  return () => {
    observer.disconnect()
    if (written !== null && el.getAttribute("aria-label") === written) {
      el.removeAttribute("aria-label")
    }
  }
}

// A slot whose `bind` runs while the tooltip is asleep.
const asleepToo = <Slot extends { bind?: unknown }>({
  bind,
  ...slot
}: Slot) => ({ ...slot, ...(bind ? { asleep: bind } : {}) })

/**
 * `tooltip`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface TooltipApi extends ReturnType<typeof tooltipApiBody> {}

// A tooltip is `createPopup` with `tooltipPreset`, which brings the warm
// group. What's its own: naming or describing its trigger, a press that
// closes it or, when toggleable, opens it and announces its text.
function tooltipApiBody(
  context: PrimitiveContext<TooltipOptions, TooltipState, string>
) {
  const { store, options } = context
  const popup = createPopup(context, { preset: tooltipPreset })
  const { control, hover, group } = popup.internal
  // Set by a press that closed the tooltip, until the pointer leaves the trigger.
  let pressed = false
  // A press opened it, so its text is announced once it shows.
  let announcing = false

  // Whether it opened at once, because another tooltip was warm, and its text once a press opened it.
  let wasOpen = store.get().open
  store.subscribe(() => {
    const { open } = store.get()
    if (open === wasOpen) {
      return
    }
    wasOpen = open
    if (open) {
      store.set({ instant: !!group?.instant() })
    }
    if (open && announcing) {
      queueMicrotask(() => {
        const content = popup.internal.popup.element()
        if (content) {
          announce(textOf(content).trim(), { doc: content.ownerDocument })
        }
      })
    }
    announcing = false
  })

  // A press toggles a toggleable tooltip. Any other closes it, unless `closeOnPress` is false,
  // and it stays closed until the pointer leaves.
  function press(key: string, payload: unknown, event?: Event) {
    const by = openerOf(event)
    if (options().toggleable) {
      if (store.get().open && popup.internal.popup.opener() !== "hover") {
        return control.hide({ reason: "trigger-press", event })
      }
      if (options().disabled) {
        return
      }
      announcing = !store.get().open
      control.show({
        event,
        by,
        reason: "trigger-press",
        trigger: key,
        payload,
      })
      return
    }
    if (options().closeOnPress === false) {
      return
    }
    hover?.clear()
    pressed = !!event && by !== "keyboard"
    control.hide({ reason: "trigger-press", event })
  }

  return {
    ...popup,
    internal: Object.assign(popup.internal, {
      tooltipPress: press,
      enter(event: PointerEvent, key: string, payload: unknown) {
        if (!pressed) {
          hover?.enter(event, key, payload)
        }
      },
      leave(event: PointerEvent) {
        pressed = false
        hover?.leave(event)
      },
    }),
  }
}

const tooltipApi: (...args: Parameters<typeof tooltipApiBody>) => TooltipApi =
  tooltipApiBody

const tooltipPrimitive = /* @__PURE__ */ definePrimitive({
  name: "tooltip",
  options: {
    container: "value",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    onPayloadChange: "callback",
    delay: "number",
    closeDelay: "number",
    disabled: "boolean",
    toggleable: "boolean",
    closeOnPress: "boolean",
    type: "string",
    shortcut: "string",
    controller: "value",
  },
  state: (options: TooltipOptions): TooltipState => ({
    ...popupState(options),
    instant: false,
    unnamed: false,
    type: options.type,
    shortcut: options.shortcut,
    apple: initialApple(),
  }),
  // Closed and on its own, it waits for its trigger to be hovered or focused.
  asleep: (options) =>
    options.open === undefined && !options.defaultOpen && !options.controller,
  sync: (options) => ({
    ...(options.open !== undefined && { open: options.open }),
    type: options.type,
    shortcut: options.shortcut,
  }),
  api: tooltipApi,
  slots: (slot) => {
    const trigger = popupTrigger(slot)
    const content = popupContent(slot)
    return {
      // A popup trigger that the tooltip names or describes, with its own
      // presses. No open attributes: the trigger is often another component's
      // trigger too, like a menu's, and those are its own.
      trigger: slot<TriggerProps, TooltipTriggerState>({
        ...trigger,
        props: { id: "id", payload: "value" },
        state: (state, { key }) => ({
          open: state.open && (state.trigger === null || state.trigger === key),
        }),
        attrs: (state, { id, key }) => {
          const active = state.trigger === null || state.trigger === key
          const label = labels(state)
          return {
            type: "button",
            "aria-labelledby": label ? `${id}-content` : undefined,
            "aria-describedby": !label && active ? `${id}-content` : undefined,
            "aria-keyshortcuts": state.shortcut
              ? ariaKeyshortcuts(state.shortcut, state.apple)
              : undefined,
          }
        },
        on: {
          ...trigger.on,
          pointerenter: (event, { api, key, props }) =>
            api.internal.enter(event, key, props.payload),
          pointerleave: (event, { api }) => api.internal.leave(event),
        },
        press: ({ api, key, props }, event) =>
          api.internal.tooltipPress(key, props.payload, event),
        // Asleep too, since the trigger is named or described before it's hovered or focused.
        bind: undefined,
        asleep(el, { key, store, id }) {
          if (dev) {
            checkName(el, "The trigger", { component: "tooltip", id })
          }
          const unbind = bindTrigger(store, key)
          adoptPlatform(store)
          // Focus that wakes it opens it only from the keyboard, which this tells from the start.
          trackInput()
          // The client knows the trigger's name now. A microtask lets hydration finish first.
          queueMicrotask(() => {
            if (store.get().trigger === key) {
              store.set({ unnamed: !hasOwnName(el, `${id}-content`) })
            }
          })
          // A popover or menu trigger on the same element checks for a name a task later. This
          // tells it the tooltip names the element, before the label renders.
          const unname = dev
            ? nameFrom(el, () => labels(store.get()))
            : undefined
          // A disabled button gets no pointer events in some browsers and no
          // focus in any, so its tooltip never shows.
          if (el.matches(":disabled")) {
            warn(
              "The trigger is a disabled button, which keyboard users can't reach, so they never see its tooltip. Use aria-disabled and ignore its presses instead, as the Tooltip docs show under Disabled buttons.",
              { component: "tooltip", id }
            )
          }
          return () => {
            unname?.()
            unbind()
          }
        },
      }),

      // `createPopup`'s content, always in the page so its trigger is named or
      // described before focus reaches it, which says when it opened at once.
      content: slot<ContentProps, TooltipContentState>({
        ...content,
        props: {
          side: "string",
          align: "string",
          sideOffset: "number",
          alignOffset: "number",
          collisionPadding: "number",
          container: "value",
          arrowPadding: "number",
          anchor: "string",
        },
        state: (state) => ({
          open: state.open,
          instant: state.instant,
          payload: state.payload,
        }),
        // Read without the api, which an asleep tooltip doesn't have yet.
        role: "tooltip",
        present: () => true,
        attrs: (state, { id }) => ({
          ...popupContentAttrs(state, id),
          tabindex: undefined,
          "data-instant": state.instant ? "" : undefined,
        }),
        asleep: (el) => labelContent(el),
        bind(el, part) {
          part.api.internal.group?.join()
          return content.bind!(el, part)
        },
      }),

      arrow: popupArrow(slot),

      // Without keys of its own, it shows the tooltip's shortcut, which names its
      // trigger before the tooltip wakes, and so writes its keys asleep too.
      shortcut: asleepToo(shortcutSlot(slot, (state) => state.shortcut)),
    }
  },
  agent: { actions: ["setOpen"] },
})

/**
 * The type of `tooltip`.
 * @stable
 */
interface TooltipPrimitive extends Named<typeof tooltipPrimitive> {}

/**
 * The tooltip primitive, with the slots `trigger`, `content`, `arrow`,
 * `shortcut`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const tooltip: TooltipPrimitive = tooltipPrimitive

export {
  createTooltipController,
  tooltip,
  tooltipPreset,
  type TooltipApi,
  type TooltipArrowState,
  type TooltipContentProps,
  type TooltipContentState,
  type TooltipController,
  type TooltipOpenChangeReason,
  type TooltipOptions,
  type TooltipPayloadChangeReason,
  type TooltipPrimitive,
  type TooltipShortcutProps,
  type TooltipShortcutState,
  type TooltipTriggerProps,
  type TooltipTriggerState,
}
