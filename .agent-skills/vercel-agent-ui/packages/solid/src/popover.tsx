import {
  popover as popoverPrimitive,
  type PopoverContentProps,
  type PopoverContentState,
  type PopoverOptions,
  type PopoverShortcutProps,
  type PopoverShortcutState,
  type PopoverTriggerProps,
  type PopoverTriggerState,
} from "@ui-sdk/core/popover"
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
  popupPart,
  sheetViewport,
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

type PopoverContextValue = PrimitiveHandle<typeof popoverPrimitive>

const parts = createParts(popoverPrimitive, {
  title: "h2",
  description: "p",
  close: "button",
  arrow: "div",
})

// The popover, for the parts that may find it through a controller or render in a popup.
const PopoverContext = createContext<PopoverContextValue | null>(null)
// Where the popup renders. Set on <Popover> or <PopoverContent>.
const ContainerContext = createContext<() => PopupContainer>(() => undefined)
// The trigger a PopoverShortcut sits in: its shortcut, and the popover it opens. A trigger
// connected through a controller sits outside the popover, so its popover comes from here.
const TriggerContext = createContext<{
  shortcut: () => string | undefined
  popover: () => PopoverContextValue | undefined
} | null>(null)

function usePopover() {
  const context = useContext(PopoverContext)
  if (!context) {
    throw new Error("Popover parts must be used inside <Popover>.")
  }
  return context
}

/**
 * The props of `Popover`.
 * @stable
 */
type PopoverProps = PopoverOptions & { children?: JSX.Element }

/**
 * Rich content in a floating panel, opened from a button. Put its trigger and content inside.
 * @stable
 */
const Popover = /* @__PURE__ */ rootScope(function Popover(
  props: PopoverProps
) {
  const options = omit(props, "children", "container")
  const popover = usePrimitive(popoverPrimitive, () => ({ ...options }))
  useControllerEntry(() => props.controller, popover)
  return providePrimitive(popover, () => (
    <PopoverContext value={popover}>
      <ContainerContext value={() => props.container}>
        {props.children}
      </ContainerContext>
    </PopoverContext>
  ))
})

type TriggerPartProps = Omit<
  PartProps<"button", PopoverTriggerState>,
  "value" | "onChange"
> &
  PopoverTriggerProps

/**
 * The button that opens the popover. A trigger outside the popover connects through `controller`.
 * @stable
 */
function PopoverTrigger(props: TriggerPartProps) {
  const popover = useControllerTarget(
    () => props.controller,
    useContext(PopoverContext)
  )
  const rest = omit(
    props,
    "disabled",
    "focusableWhenDisabled",
    "payload",
    "shortcut",
    "controller"
  )
  return (
    <TriggerContext value={{ shortcut: () => props.shortcut, popover }}>
      <Show
        when={popover()}
        keyed
        // Until the popover it names mounts, a trigger outside the popover is a plain button.
        fallback={renderStatic(
          "button",
          () => ({
            attrs: {},
            state: { open: false, disabled: !!props.disabled },
          }),
          merge(rest, {
            type: "button",
            get disabled() {
              return props.disabled && !props.focusableWhenDisabled
            },
            get "aria-disabled"() {
              return (
                (props.disabled && props.focusableWhenDisabled) || undefined
              )
            },
          })
        )}
      >
        {(popover) => {
          const id = createUniqueId()
          const trigger = () => ({
            id,
            disabled: props.disabled,
            focusableWhenDisabled: props.focusableWhenDisabled,
            payload: props.payload,
            shortcut: props.shortcut,
          })
          return usePart(popover, "trigger", trigger, rest, "button")
        }}
      </Show>
    </TriggerContext>
  )
}

/**
 * The panel itself, positioned against its trigger, named by its title and described by its description.
 * @stable
 */
function PopoverContent<Payload = unknown>(
  props: PartProps<"div", PopoverContentState<Payload>> & PopoverContentProps
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
    initialFocus: props.initialFocus,
    finalFocus: props.finalFocus,
    keepMounted: props.keepMounted,
    inline: props.inline,
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
    "initialFocus",
    "finalFocus",
    "keepMounted",
    "inline",
    "container"
  )
  return popupPart(
    usePopover(),
    "content",
    content,
    rest,
    target,
    sheetViewport,
    () => props.inline
  )
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

/**
 * Shows a trigger's shortcut, like `⌘I`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
function PopoverShortcut(
  props: PartProps<"span", PopoverShortcutState> & PopoverShortcutProps
) {
  const trigger = useContext(TriggerContext)
  const context = useContext(PopoverContext)
  if (!context && !trigger) {
    throw new Error("Popover parts must be used inside <Popover>.")
  }
  // A trigger outside the popover finds it through its controller only once
  // mounted, so inside one whose popover hasn't mounted yet, there's no
  // shortcut to show, as on the server.
  const popover = () => context ?? trigger?.popover()
  const shortcut = () => ({ shortcut: props.shortcut ?? trigger?.shortcut() })
  const rest = merge(omit(props, "shortcut"), {
    get children() {
      return props.children ?? ((state: PopoverShortcutState) => state.text)
    },
  })
  return (
    <Show when={popover()} keyed>
      {(popover) => usePart(popover, "shortcut", shortcut, rest, "span")}
    </Show>
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
