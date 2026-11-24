import {
  hoverCard,
  type HoverCardContentProps,
  type HoverCardContentState,
  type HoverCardOptions,
  type HoverCardTriggerProps,
  type HoverCardTriggerState,
} from "@ui-sdk/core/hover-card"
import * as React from "react"
import {
  Connected,
  renderPopup,
  useControllerEntry,
  useOwnContainer,
  usePopupContainer,
  type PopupContainer,
} from "./popup"
import {
  createParts,
  HandleScope,
  renderElement,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(hoverCard, { trigger: "a", arrow: "div" })

// Where the popup renders. Set on <HoverCard> or <HoverCardContent>.
const ContainerContext = React.createContext<PopupContainer>(undefined)

/**
 * The props of `HoverCard`.
 * @stable
 */
type HoverCardProps = HoverCardOptions & { children?: React.ReactNode }

/**
 * A preview of what a link points to, shown when the pointer rests on the link or keyboard focus stays on it.
 * @stable
 */
function HoverCard({ children, container, ...options }: HoverCardProps) {
  const handle = usePrimitive(hoverCard, options)
  useControllerEntry(options.controller, handle)
  return (
    <HandleScope handle={handle}>
      <ContainerContext.Provider value={container}>
        {children}
      </ContainerContext.Provider>
    </HandleScope>
  )
}

/**
 * A link by default: pressing it follows the link, and hover or focus opens the card.
 * @stable
 */
function HoverCardTrigger({
  controller,
  ...props
}: PartProps<"a", HoverCardTriggerState> & HoverCardTriggerProps) {
  const { payload: _, render, ...rest } = props
  // Until the card it names mounts, a trigger outside the card is a plain link.
  const unconnected = () => renderElement("a", rest, render, { open: false })
  return (
    <Connected
      primitive={hoverCard}
      controller={controller}
      fallback={unconnected}
    >
      <parts.Trigger {...props} />
    </Connected>
  )
}

/**
 * The card itself, positioned against its trigger.
 * @stable
 */
function HoverCardContent<Payload = unknown>({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  keepMounted,
  container,
  ...props
}: PartProps<"div", HoverCardContentState<Payload>> & HoverCardContentProps) {
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const content = {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    keepMounted,
  }
  // The payload's type is the app's, from `Payload`; the part hands its state on as it is.
  const element = usePart(
    hoverCard,
    "content",
    content,
    props as PartProps<"div", HoverCardContentState>
  )
  return element && renderPopup(element, target)
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
