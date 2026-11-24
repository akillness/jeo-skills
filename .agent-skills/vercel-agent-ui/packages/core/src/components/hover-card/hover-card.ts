import { createPopupController } from "../../foundation/popups/popup"
import {
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import {
  createPopup,
  popupState,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { hoverCardPreset } from "../../foundation/popups/popup-hover-presets"
import {
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

/**
 * Why a hover card opened or closed.
 * @stable
 */
type HoverCardOpenChangeReason =
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
 * Why the card's payload changed: a trigger opened it, another trigger took it over while open, or a controller opened it or gave the open one another payload.
 * @stable
 */
type HoverCardPayloadChangeReason =
  "trigger-hover" | "trigger-focus" | "trigger-press" | "imperative"

/**
 * Opens, closes and inspects a hover card from outside it, and connects
 * triggers outside it, like one card for every author link in a feed. Pass it
 * as the `controller` option. `Payload` is the type of the data triggers and
 * `open()` pass to the content.
 * @stable
 */
function createHoverCardController<Payload = unknown>() {
  return createPopupController<
    Payload,
    HoverCardOpenChangeReason,
    {},
    string,
    HoverCardPayloadChangeReason
  >()
}

/**
 * A controller from `createHoverCardController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type HoverCardController<Payload = unknown> = ReturnType<
  typeof createHoverCardController<Payload>
>

/**
 * The options `hoverCard` takes. A component takes them as props on its root.
 * @stable
 */
type HoverCardOptions = PortalProps & {
  /** Whether the card is open. Pass it to control the card. */
  open?: boolean
  /**
   * Whether the card starts open, when uncontrolled.
   * @defaultValue false
   */
  defaultOpen?: boolean
  /** Runs when the card wants to open or close. `details.reason` says why, and `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<HoverCardOpenChangeReason>
  ) => void
  /** Runs once the card has finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /**
   * Runs when the payload the content shows changes: a trigger with another payload opens the
   * card, or takes the open card over, which fires no `onOpenChange`, and so does a controller's
   * `open({ payload })` on the open card. `details.cancel()` keeps the previous payload.
   */
  onPayloadChange?: (
    payload: unknown,
    details: ChangeDetails<HoverCardPayloadChangeReason>
  ) => void
  /**
   * Milliseconds the pointer rests on the trigger, or keyboard focus stays on it, before the card opens.
   * @defaultValue 600
   */
  delay?: number
  /**
   * Milliseconds before the card closes once the pointer leaves the trigger and the card.
   * @defaultValue 300
   */
  closeDelay?: number
  /**
   * Stops the card from opening. The trigger keeps working as a link.
   * @defaultValue false
   */
  disabled?: boolean
  /** Opens, closes and inspects the card from anywhere, and connects triggers outside it. Create one with `createHoverCardController()`. */
  controller?: HoverCardController<any>
} & PrimitiveOptions

type TriggerProps = {
  /** Data for the content to render when this trigger opens the card, like the profile it links to. */
  payload?: unknown
}

type ContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the trigger the card opens on.
     * @defaultValue "bottom"
     */
    side?: PositionProps["side"]
    /**
     * How the card lines up with the trigger along that side.
     * @defaultValue "center"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the trigger and the card, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the trigger, in pixels.
     * @defaultValue 0
     */
    alignOffset?: number
    /**
     * Whether the card stays in the page, hidden, while closed. Its content keeps its state between opens.
     * @defaultValue false
     */
    keepMounted?: boolean
  }

/**
 * The props the `trigger` slot of `hoverCard` takes.
 * @stable
 */
type HoverCardTriggerProps = TriggerProps & {
  /** Connects a trigger outside the card, like every author link in a feed, to the card with this controller. */
  controller?: HoverCardController<any>
}
/**
 * The props the `content` slot of `hoverCard` takes.
 * @stable
 */
type HoverCardContentProps = ContentProps

/**
 * The state the `trigger` slot of `hoverCard` hands `render` functions and
 * state-based class names.
 * @stable
 */
type HoverCardTriggerState = {
  /** Whether the card is open from this trigger. */
  open: boolean
}
/**
 * The state the `content` slot of `hoverCard` hands `render` functions and
 * state-based class names.
 * @stable
 */
type HoverCardContentState<Payload = unknown> = {
  /** Whether the card is open. False while it animates out. */
  open: boolean
  /**
   * The payload of the last open, from the trigger that opened it or a
   * controller, typed as the controller's `Payload`.
   */
  payload: Payload | undefined
}
/**
 * The state the `arrow` slot of `hoverCard` hands `render` functions and
 * state-based class names.
 * @stable
 */
type HoverCardArrowState = {
  /** Whether the card is open. False as soon as it starts closing, while it still animates out. */
  open: boolean
}

/**
 * `hoverCard`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface HoverCardApi extends ReturnType<typeof hoverCardApiBody> {}

// A hover card is `createPopup` with `hoverCardPreset`, and nothing of its own.
function hoverCardApiBody(
  context: PrimitiveContext<HoverCardOptions, PopupState, string>
) {
  return createPopup(context, { preset: hoverCardPreset })
}

const hoverCardApi: (
  ...args: Parameters<typeof hoverCardApiBody>
) => HoverCardApi = hoverCardApiBody

const hoverCardPrimitive = /* @__PURE__ */ definePrimitive({
  name: "hover-card",
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
    controller: "value",
  },
  state: (options: HoverCardOptions) => popupState(options),
  sync: (options) => (options.open === undefined ? {} : { open: options.open }),
  api: hoverCardApi,
  slots: (slot) => {
    const trigger = popupTrigger(slot)
    const content = popupContent(slot)
    return {
      // A link, usually. Pressing it follows the link, so only hover and focus open the card.
      trigger: slot<TriggerProps, HoverCardTriggerState>({
        ...trigger,
        props: { id: "id", payload: "value" },
        state: (state, { key }) => ({
          open: state.open && (state.trigger === null || state.trigger === key),
        }),
      }),
      content: slot<ContentProps, HoverCardContentState>({
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
          keepMounted: "boolean",
        },
        state: (state) => ({ open: state.open, payload: state.payload }),
      }),
      arrow: popupArrow(slot),
    }
  },
  agent: { actions: ["setOpen"] },
})

/**
 * The type of `hoverCard`.
 * @stable
 */
interface HoverCardPrimitive extends Named<typeof hoverCardPrimitive> {}

/**
 * The hover card primitive, with the slots `trigger`, `content`, `arrow`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const hoverCard: HoverCardPrimitive = hoverCardPrimitive

export {
  createHoverCardController,
  hoverCard,
  hoverCardPreset,
  type HoverCardApi,
  type HoverCardArrowState,
  type HoverCardContentProps,
  type HoverCardContentState,
  type HoverCardController,
  type HoverCardOpenChangeReason,
  type HoverCardOptions,
  type HoverCardPayloadChangeReason,
  type HoverCardPrimitive,
  type HoverCardTriggerProps,
  type HoverCardTriggerState,
}
