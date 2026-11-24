import {
  tooltip as tooltipPrimitive,
  type TooltipContentProps,
  type TooltipContentState,
  type TooltipOptions,
  type TooltipShortcutProps,
  type TooltipShortcutState,
  type TooltipTriggerProps,
  type TooltipTriggerState,
} from "@ui-sdk/core/tooltip"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createUniqueId,
  merge,
  omit,
  Show,
  useContext,
} from "solid-js"
import {
  renderPopup,
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

type TooltipContextValue = PrimitiveHandle<typeof tooltipPrimitive>

const parts = createParts(tooltipPrimitive, { arrow: "div" })

// The tooltip, for the parts that may find it through a controller or render in a popup.
const TooltipContext = createContext<TooltipContextValue | null>(null)
// Where the popup renders. Set on <Tooltip> or <TooltipContent>.
const ContainerContext = createContext<() => PopupContainer>(() => undefined)
// The tooltip of the trigger a TooltipShortcut sits in. A trigger connected through a
// controller sits outside the tooltip, so its tooltip comes from here.
const TriggerContext = createContext<{
  tooltip: () => TooltipContextValue | undefined
} | null>(null)

function useTooltip() {
  const context = useContext(TooltipContext)
  if (!context) {
    throw new Error("Tooltip parts must be used inside <Tooltip>.")
  }
  return context
}

/**
 * The props of `Tooltip`.
 * @stable
 */
type TooltipProps = TooltipOptions & { children?: JSX.Element }

/**
 * A short label or hint that appears when the pointer rests on its trigger or keyboard focus reaches it.
 * @stable
 */
const Tooltip = /* @__PURE__ */ rootScope(function Tooltip(
  props: TooltipProps
) {
  const options = omit(props, "children", "container")
  const tooltip = usePrimitive(tooltipPrimitive, () => ({ ...options }))
  useControllerEntry(() => props.controller, tooltip)
  return providePrimitive(tooltip, () => (
    <TooltipContext value={tooltip}>
      <ContainerContext value={() => props.container}>
        {props.children}
      </ContainerContext>
    </TooltipContext>
  ))
})

type TriggerPartProps = Omit<
  PartProps<"button", TooltipTriggerState>,
  "value" | "defaultValue" | "onChange"
> &
  TooltipTriggerProps

/**
 * The element the tooltip names or describes, usually a button.
 * @stable
 */
function TooltipTrigger(props: TriggerPartProps) {
  const tooltip = useControllerTarget(
    () => props.controller,
    useContext(TooltipContext)
  )
  const rest = omit(props, "payload", "controller")
  return (
    <TriggerContext value={{ tooltip }}>
      <Show
        when={tooltip()}
        keyed
        // Until the tooltip it names mounts, a trigger outside the tooltip is a plain button.
        fallback={renderStatic(
          "button",
          () => ({ attrs: {}, state: { open: false } }),
          merge(rest, { type: "button" })
        )}
      >
        {(tooltip) => {
          const id = createUniqueId()
          return usePart(
            tooltip,
            "trigger",
            () => ({ id, payload: props.payload }),
            rest,
            "button"
          )
        }}
      </Show>
    </TriggerContext>
  )
}

/**
 * The tooltip itself, positioned against its trigger.
 * @stable
 */
function TooltipContent<Payload = unknown>(
  props: PartProps<"div", TooltipContentState<Payload>> & TooltipContentProps
) {
  const tooltip = useTooltip()
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
    "container"
  )
  return renderPopup(
    () => usePart(tooltip, "content", content, rest, "div"),
    target
  )
}

/**
 * An arrow on the tooltip's edge that points at its trigger.
 * @stable
 */
const TooltipArrow = parts.Arrow

/**
 * Shows the tooltip's shortcut, like `⌘S`, formatted for the platform.
 * @stable
 */
function TooltipShortcut(
  props: PartProps<"span", TooltipShortcutState> & TooltipShortcutProps
) {
  const trigger = useContext(TriggerContext)
  const context = useContext(TooltipContext)
  if (!context && !trigger) {
    throw new Error("Tooltip parts must be used inside <Tooltip>.")
  }
  // Inside a trigger whose tooltip hasn't mounted yet, there's no shortcut to show.
  const tooltip = () => context ?? trigger?.tooltip()
  const shortcut = () => ({ shortcut: props.shortcut })
  const rest = merge(omit(props, "shortcut"), {
    get children() {
      return props.children ?? ((state: TooltipShortcutState) => state.text)
    },
  })
  return (
    <Show when={tooltip()} keyed>
      {(tooltip) => usePart(tooltip, "shortcut", shortcut, rest, "span")}
    </Show>
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
