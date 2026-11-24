import {
  hoverCard as hoverCardPrimitive,
  type HoverCardContentProps,
  type HoverCardContentState,
  type HoverCardOptions,
  type HoverCardTriggerProps,
  type HoverCardTriggerState,
} from "@ui-sdk/core/hover-card"
import type { JSX } from "@solidjs/web"
import { createContext, createUniqueId, omit, Show, useContext } from "solid-js"
import {
  popupPart,
  useControllerEntry,
  useControllerTarget,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import {
  createParts,
  providePrimitive,
  renderStatic,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type HoverCardContextValue = PrimitiveHandle<typeof hoverCardPrimitive>

const parts = createParts(hoverCardPrimitive, { arrow: "div" })

// The card, for the parts that may find it through a controller or render in a popup.
const HoverCardContext = createContext<HoverCardContextValue | null>(null)
// Where the popup renders. Set on <HoverCard> or <HoverCardContent>.
const ContainerContext = createContext<() => PopupContainer>(() => undefined)

function useHoverCard() {
  const context = useContext(HoverCardContext)
  if (!context) {
    throw new Error("HoverCard parts must be used inside <HoverCard>.")
  }
  return context
}

/**
 * The props of `HoverCard`.
 * @stable
 */
type HoverCardProps = HoverCardOptions & { children?: JSX.Element }

/**
 * A preview of what a link points to, shown when the pointer rests on the link or keyboard focus stays on it.
 * @stable
 */
const HoverCard = /* @__PURE__ */ rootScope(function HoverCard(
  props: HoverCardProps
) {
  const options = omit(props, "children", "container")
  const hoverCard = usePrimitive(hoverCardPrimitive, () => ({ ...options }))
  useControllerEntry(() => props.controller, hoverCard)
  return providePrimitive(hoverCard, () => (
    <HoverCardContext value={hoverCard}>
      <ContainerContext value={() => props.container}>
        {props.children}
      </ContainerContext>
    </HoverCardContext>
  ))
})

type TriggerPartProps = PartProps<"a", HoverCardTriggerState> &
  HoverCardTriggerProps

/**
 * A link by default: pressing it follows the link, and hover or focus opens the card.
 * @stable
 */
function HoverCardTrigger(props: TriggerPartProps) {
  const hoverCard = useControllerTarget(
    () => props.controller,
    useContext(HoverCardContext)
  )
  const rest = omit(props, "payload", "controller")
  return (
    <Show
      when={hoverCard()}
      keyed
      // Until the card it names mounts, a trigger outside the card is a plain link.
      fallback={renderStatic(
        "a",
        () => ({ attrs: {}, state: { open: false } }),
        rest
      )}
    >
      {(hoverCard) => {
        const id = createUniqueId()
        return usePart(
          hoverCard,
          "trigger",
          () => ({ id, payload: props.payload }),
          rest,
          "a"
        )
      }}
    </Show>
  )
}

/**
 * The card itself, positioned against its trigger.
 * @stable
 */
function HoverCardContent<Payload = unknown>(
  props: PartProps<"div", HoverCardContentState<Payload>> &
    HoverCardContentProps
) {
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
  const content = () => ({
    side: props.side,
    align: props.align,
    sideOffset: props.sideOffset,
    alignOffset: props.alignOffset,
    collisionPadding: props.collisionPadding,
    arrowPadding: props.arrowPadding,
    anchor: props.anchor,
    keepMounted: props.keepMounted,
  })
  const rest = omit(
    props,
    "side",
    "align",
    "sideOffset",
    "alignOffset",
    "collisionPadding",
    "arrowPadding",
    "anchor",
    "keepMounted",
    "container"
  )
  return popupPart(useHoverCard(), "content", content, rest, target)
}

/**
 * An arrow on the card's edge that points at its trigger.
 * @stable
 */
const HoverCardArrow = parts.Arrow

export { createHoverCardController } from "@ui-sdk/core/hover-card"
export type {
  HoverCardApi,
  HoverCardArrowState,
  HoverCardContentProps,
  HoverCardContentState,
  HoverCardController,
  HoverCardOpenChangeReason,
  HoverCardOptions,
  HoverCardPayloadChangeReason,
  HoverCardPrimitive,
  HoverCardTriggerProps,
  HoverCardTriggerState,
} from "@ui-sdk/core/hover-card"

export {
  HoverCard,
  HoverCardArrow,
  HoverCardContent,
  type HoverCardProps,
  HoverCardTrigger,
}
