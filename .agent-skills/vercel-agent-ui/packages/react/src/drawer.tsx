import type {
  DialogShortcutProps,
  DialogShortcutState,
  DialogTriggerState,
} from "@ui-sdk/core/dialog"
import {
  drawer,
  type DrawerBackdropState,
  type DrawerContentProps,
  type DrawerContentState,
  type DrawerOptions,
  type DrawerOutletProps,
  type DrawerTriggerProps,
  type DrawerOutletState,
} from "@ui-sdk/core/drawer"
import * as React from "react"
import {
  Connected,
  renderPopup,
  sheetViewport,
  useControllerEntry,
  useOwnContainer,
  usePopupContainer,
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

const parts = createParts(drawer, {
  trigger: "button",
  handle: "button",
  title: "h2",
  description: "p",
  close: "button",
  outlet: "div",
})

type TriggerPartProps = Omit<
  PartProps<"button", DialogTriggerState>,
  "value" | "defaultValue" | "onChange"
> &
  DrawerTriggerProps
type ShortcutPartProps = PartProps<"span", DialogShortcutState> &
  DialogShortcutProps

// Where the drawer renders. Set on the root or the content.
const ContainerContext = React.createContext<PopupContainer>(undefined)
// The trigger a Shortcut part sits in, which may be outside its drawer, and its shortcut.
const TriggerContext = React.createContext<{ shortcut?: string } | null>(null)

/**
 * The props of `Drawer`.
 * @stable
 */
type DrawerProps = DrawerOptions & { children?: React.ReactNode }

/**
 * A dialog presented as a sheet that slides in from an edge. Put its trigger, backdrop and content inside.
 * @stable
 */
function Drawer({ children, container, ...options }: DrawerProps) {
  const handle = usePrimitive(drawer, options)
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
 * The button that opens the drawer. A trigger outside the drawer, like one per table row, connects through
 * `controller`.
 * @stable
 */
function DrawerTrigger({ controller, ...props }: TriggerPartProps) {
  const {
    disabled,
    focusableWhenDisabled,
    payload: _,
    shortcut,
    render,
    ...rest
  } = props
  // Until the drawer it names mounts, a trigger outside the drawer is a plain button.
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
        primitive={drawer}
        controller={controller}
        fallback={unconnected}
      >
        <parts.Trigger {...props} />
      </Connected>
    </TriggerContext.Provider>
  )
}

/**
 * A dim behind the drawer. Its opacity follows the drawer, so give it a color like `bg-black/20`.
 * @stable
 */
function DrawerBackdrop(props: PartProps<"div", DrawerBackdropState>) {
  const target = usePopupContainer(React.useContext(ContainerContext))
  const element = usePart(drawer, "backdrop", {}, props)
  return element && renderPopup(element, target)
}

/**
 * The sheet itself, a dialog. It renders inside a full-screen viewport the drawer positions it in.
 * @stable
 */
function DrawerContent<Payload = unknown>({
  initialFocus,
  finalFocus,
  keepMounted,
  container,
  render,
  ...props
}: PartProps<"div", DrawerContentState<Payload>> & DrawerContentProps) {
  const handle = useHandle(drawer)
  const target = usePopupContainer(useOwnContainer(container, ContainerContext))
  // The payload's type is the app's, from `Payload`; the part hands its state on as it is.
  const partProps = {
    ...props,
    render: sheetViewport(handle, render),
  } as PartProps<"div", DrawerContentState>
  const element = usePart(
    handle,
    "content",
    { initialFocus, finalFocus, keepMounted },
    partProps
  )
  return element && renderPopup(element, target)
}

/**
 * The grabber. Pressing it moves to the next snap point; arrow keys, Home and End step. Name it, like `aria-label="Resize"`.
 * @stable
 */
const DrawerHandle = parts.Handle

/**
 * The drawer's title, which names it. A level 2 heading by default.
 * @stable
 */
const DrawerTitle = parts.Title

/**
 * Describes the drawer while it's rendered. A paragraph by default.
 * @stable
 */
const DrawerDescription = parts.Description

/**
 * A button that closes the drawer. An `action` runs first, and a Promise it returns keeps the drawer open
 * until it settles.
 * @stable
 */
const DrawerClose = parts.Close

/**
 * Shows a trigger's shortcut, like `⌘K`, inside the trigger. Hidden from screen readers, which hear `aria-keyshortcuts`.
 * @stable
 */
function DrawerShortcut(props: ShortcutPartProps) {
  const trigger = React.useContext(TriggerContext)
  if (useNearest(drawer)) {
    return <ShortcutPart inherited={trigger?.shortcut} {...props} />
  }
  // Inside a trigger whose drawer hasn't mounted yet, there's no shortcut to show.
  if (trigger) {
    return null
  }
  throw new Error("Drawer parts must be used inside <Drawer>.")
}

const text = (state: DialogShortcutState) => state.text

function ShortcutPart({
  inherited,
  shortcut,
  children = text,
  ...props
}: ShortcutPartProps & { inherited?: string }) {
  return usePart(
    drawer,
    "shortcut",
    { shortcut: shortcut ?? inherited },
    { ...props, children },
    "span"
  )
}

/**
 * An element that follows the drawer, like the page behind it: it plays its
 * `keyframes` as the drawer expands and gets the `--drawer-*` variables.
 * Outside the drawer, pass the drawer's `controller`.
 * @stable
 */
function DrawerOutlet({
  controller,
  ...props
}: PartProps<"div", DrawerOutletState> & DrawerOutletProps) {
  const { keyframes: _, render, ...rest } = props
  return (
    <Connected
      primitive={drawer}
      controller={controller}
      fallback={() => renderElement("div", rest, render, { open: false })}
    >
      <parts.Outlet {...props} />
    </Connected>
  )
}

export { createDrawerController, sheetPhysics } from "@ui-sdk/core/drawer"
export type {
  DrawerApi,
  DrawerBackdropState,
  DrawerContentProps,
  DrawerContentState,
  DrawerController,
  DrawerDismissAttemptDetails,
  DrawerDismissReason,
  DrawerDriver,
  DrawerHandleState,
  DrawerKeyframes,
  DrawerOpenChangeReason,
  DrawerOptions,
  DrawerOutletProps,
  DrawerOutletState,
  DrawerPayloadChangeReason,
  DrawerPrimitive,
  DrawerSide,
  DrawerSnapPointChangeReason,
  DrawerTriggerProps,
  SheetPhysics,
  SnapPoint,
} from "@ui-sdk/core/drawer"

export {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerOutlet,
  type DrawerProps,
  DrawerShortcut,
  DrawerTitle,
  DrawerTrigger,
}
