import {
  tooltip,
  type TooltipContentProps,
  type TooltipContentState,
  type TooltipOptions,
  type TooltipShortcutProps,
  type TooltipShortcutState,
  type TooltipTriggerProps,
  type TooltipTriggerState,
} from "@ui-sdk/core/tooltip"
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
  useNearest,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(tooltip, { trigger: "button", arrow: "div" })

// Where the popup renders. Set on <Tooltip> or <TooltipContent>.
const ContainerContext = React.createContext<PopupContainer>(undefined)
// Whether a TooltipShortcut sits in a trigger, which may be outside its tooltip.
const InTriggerContext = React.createContext(false)

/**
 * The props of `Tooltip`.
 * @stable
 */
type TooltipProps = TooltipOptions & { children?: React.ReactNode }

/**
 * A short label or hint that appears when the pointer rests on its trigger or keyboard focus reaches it.
 * @stable
 */
function Tooltip({ children, container, ...options }: TooltipProps) {
  const handle = usePrimitive(tooltip, options)
  useControllerEntry(options.controller, handle)
  return (
    <HandleScope handle={handle}>
      <ContainerContext.Provider value={container}>
        {children}
      </ContainerContext.Provider>
    </HandleScope>
  )
}

type TriggerPartProps = Omit<
  PartProps<"button", TooltipTriggerState>,
  "value" | "defaultValue" | "onChange"
> &
  TooltipTriggerProps

/**
 * The element the tooltip names or describes, usually a button.
 * @stable
 */
function TooltipTrigger({ controller, ...props }: TriggerPartProps) {
  const { payload: _, render, ...rest } = props
  // Until the tooltip it names mounts, a trigger outside the tooltip is a plain button.
  const unconnected = () =>
    renderElement("button", { type: "button", ...rest }, render, {
      open: false,
    })
  return (
    <InTriggerContext.Provider value>
      <Connected
        primitive={tooltip}
        controller={controller}
        fallback={unconnected}
      >
        <parts.Trigger {...props} />
      </Connected>
    </InTriggerContext.Provider>
  )
}

/**
 * The tooltip itself, positioned against its trigger.
 * @stable
 */
function TooltipContent<Payload = unknown>({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  container,
  ...props
}: PartProps<"div", TooltipContentState<Payload>> & TooltipContentProps) {
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const content = {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
  }
  // The payload's type is the app's, from `Payload`; the part hands its state on as it is.
  const element = usePart(
    tooltip,
    "content",
    content,
    props as PartProps<"div", TooltipContentState>
  )
  return element && renderPopup(element, target)
}

/**
 * An arrow on the tooltip's edge that points at its trigger.
 * @stable
 */
const TooltipArrow = parts.Arrow

const text = (state: TooltipShortcutState) => state.text

/**
 * Shows the tooltip's shortcut, like `⌘S`, formatted for the platform.
 * @stable
 */
function TooltipShortcut(
  props: PartProps<"span", TooltipShortcutState> & TooltipShortcutProps
) {
  const inTrigger = React.useContext(InTriggerContext)
  if (useNearest(tooltip)) {
    return <ShortcutPart {...props} />
  }
  // Inside a trigger whose tooltip hasn't mounted yet, there's no shortcut to show.
  if (inTrigger) {
    return null
  }
  throw new Error("Tooltip parts must be used inside <Tooltip>.")
}

function ShortcutPart({
  shortcut,
  children = text,
  ...props
}: PartProps<"span", TooltipShortcutState> & TooltipShortcutProps) {
  return usePart(
    tooltip,
    "shortcut",
    { shortcut },
    { ...props, children },
    "span"
  )
}

export { createTooltipController } from "@ui-sdk/core/tooltip"
export type {
  TooltipApi,
  TooltipArrowState,
  TooltipContentProps,
  TooltipContentState,
  TooltipController,
  TooltipOpenChangeReason,
  TooltipOptions,
  TooltipPayloadChangeReason,
  TooltipPrimitive,
  TooltipShortcutProps,
  TooltipShortcutState,
  TooltipTriggerProps,
  TooltipTriggerState,
} from "@ui-sdk/core/tooltip"

export {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  type TooltipProps,
  TooltipShortcut,
  TooltipTrigger,
}
