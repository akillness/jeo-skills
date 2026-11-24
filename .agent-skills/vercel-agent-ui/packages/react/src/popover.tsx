import {
  popover,
  type PopoverContentProps,
  type PopoverContentState,
  type PopoverOptions,
  type PopoverShortcutProps,
  type PopoverShortcutState,
  type PopoverTriggerProps,
  type PopoverTriggerState,
} from "@ui-sdk/core/popover"
import * as React from "react"
import {
  Connected,
  renderPopup,
  sheetViewport,
  useOwnContainer,
  usePopupContainer,
  useControllerEntry,
  type PopupContainer,
} from "./popup"
import {
  createParts,
  HandleScope,
  renderElement,
  useHandle,
  useNearest,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

const parts = createParts(popover, {
  trigger: "button",
  title: "h2",
  description: "p",
  close: "button",
  arrow: "div",
})

// Where the popup renders. Set on <Popover> or <PopoverContent>.
const ContainerContext = React.createContext<PopupContainer>(undefined)
// The trigger a PopoverShortcut sits in, which may be outside its popover, and its shortcut.
const TriggerContext = React.createContext<{ shortcut?: string } | null>(null)

/**
 * The props of `Popover`.
 * @stable
 */
type PopoverProps = PopoverOptions & { children?: React.ReactNode }

/**
 * Rich content in a floating panel, opened from a button. Put its trigger and content inside.
 * @stable
 */
function Popover({ children, container, ...options }: PopoverProps) {
  const handle = usePrimitive(popover, options)
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
 * The button that opens the popover. A trigger outside the popover connects through `controller`.
 * @stable
 */
function PopoverTrigger({
  controller,
  ...props
}: Omit<
  PartProps<"button", PopoverTriggerState>,
  "value" | "defaultValue" | "onChange"
> &
  PopoverTriggerProps) {
  const {
    disabled,
    focusableWhenDisabled,
    payload: _,
    shortcut,
    render,
    ...rest
  } = props
  // Until the popover it names mounts, a trigger outside the popover is a plain button.
  const unconnected = () =>
    renderElement(
      "button",
      {
        type: "button",
        disabled: disabled && !focusableWhenDisabled,
        "aria-disabled": (disabled && focusableWhenDisabled) || undefined,
        ...rest,
      },
      render,
      {
        open: false,
        disabled: !!disabled,
      }
    )
  return (
    <TriggerContext.Provider value={{ shortcut }}>
      <Connected
        primitive={popover}
        controller={controller}
        fallback={unconnected}
      >
        <parts.Trigger {...props} />
      </Connected>
    </TriggerContext.Provider>
  )
}

/**
 * The panel itself, positioned against its trigger, named by its title and described by its description.
 * @stable
 */
function PopoverContent<Payload = unknown>({
  side,
  align,
  sideOffset,
  alignOffset,
  collisionPadding,
  arrowPadding,
  anchor,
  initialFocus,
  finalFocus,
  keepMounted,
  inline,
  container,
  render,
  ...props
}: PartProps<"div", PopoverContentState<Payload>> & PopoverContentProps) {
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  const content = {
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    arrowPadding,
    anchor,
    initialFocus,
    finalFocus,
    keepMounted,
    inline,
  }
  const handle = useHandle(popover)
  // The payload's type is the app's, from `Payload`; the part hands its state on as it is.
  const partProps = {
    ...props,
    render: sheetViewport(handle, render),
  } as PartProps<"div", PopoverContentState>
  const element = usePart(handle, "content", content, partProps)
  return element && (inline ? element : renderPopup(element, target))
}

/**
 * The popover's title, which names it. A level 2 heading by default.
 * @stable
 */
const PopoverTitle = parts.Title

/**
 * Describes the popover while it's rendered. A paragraph by default.
 * @stable
 */
const PopoverDescription = parts.Description

/**
 * A button that closes the popover.
 * @stable
 */
const PopoverClose = parts.Close

/**
 * An arrow on the panel's edge that points at its trigger.
 * @stable
 */
const PopoverArrow = parts.Arrow

type ShortcutPartProps = PartProps<"span", PopoverShortcutState> &
  PopoverShortcutProps

/**
 * Shows a trigger's shortcut, like `⌘I`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
function PopoverShortcut(props: ShortcutPartProps) {
  const trigger = React.useContext(TriggerContext)
  if (useNearest(popover)) {
    return <ShortcutPart inherited={trigger?.shortcut} {...props} />
  }
  // Inside a trigger whose popover hasn't mounted yet, there's no shortcut to show.
  if (trigger) {
    return null
  }
  throw new Error("Popover parts must be used inside <Popover>.")
}

const text = (state: PopoverShortcutState) => state.text

function ShortcutPart({
  inherited,
  shortcut,
  children = text,
  ...props
}: ShortcutPartProps & { inherited?: string }) {
  return usePart(
    popover,
    "shortcut",
    { shortcut: shortcut ?? inherited },
    { ...props, children },
    "span"
  )
}

export { createPopoverController } from "@ui-sdk/core/popover"
export type {
  PopoverApi,
  PopoverArrowState,
  PopoverContentProps,
  PopoverContentState,
  PopoverController,
  PopoverDismissReason,
  PopoverFinalFocus,
  PopoverInitialFocus,
  PopoverOpenChangeReason,
  PopoverOptions,
  PopoverPayloadChangeReason,
  PopoverPrimitive,
  PopoverShortcutProps,
  PopoverShortcutState,
  PopoverTriggerProps,
  PopoverTriggerState,
} from "@ui-sdk/core/popover"

export {
  Popover,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  type PopoverProps,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
}
