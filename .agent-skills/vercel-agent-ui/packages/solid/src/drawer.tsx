import type {
  DialogShortcutProps,
  DialogShortcutState,
  DialogTriggerState,
} from "@ui-sdk/core/dialog"
import {
  drawer as drawerPrimitive,
  type DrawerBackdropState,
  type DrawerContentProps,
  type DrawerContentState,
  type DrawerController,
  type DrawerOptions,
  type DrawerOutletProps,
  type DrawerTriggerProps,
  type DrawerOutletState,
} from "@ui-sdk/core/drawer"
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

type DrawerContextValue = PrimitiveHandle<typeof drawerPrimitive>

type TriggerPartProps = Omit<
  PartProps<"button", DialogTriggerState>,
  "value" | "onChange"
> &
  DrawerTriggerProps
type OutletPartProps = PartProps<"div", DrawerOutletState> & DrawerOutletProps

const parts = createParts(drawerPrimitive, {
  handle: "button",
  title: "h2",
  description: "p",
  close: "button",
})

// The drawer, for the parts that may find it through a controller or render in a popup.
const Context = createContext<DrawerContextValue | null>(null)
// Where the drawer renders. Set on the root or the content.
const ContainerContext = createContext<() => PopupContainer>(() => undefined)
// The trigger a Shortcut part sits in: its shortcut, and the drawer it opens. A trigger
// connected through a controller sits outside the drawer, so its drawer comes from here.
const TriggerContext = createContext<{
  shortcut: () => string | undefined
  drawer: () => DrawerContextValue | undefined
} | null>(null)

function useDrawer() {
  const context = useContext(Context)
  if (!context) {
    throw new Error("Drawer parts must be used inside <Drawer>.")
  }
  return context
}

// The drawer a part belongs to: the one its controller names, else the one around it.
function useDrawerOrRemote(
  controller: () => DrawerController<any, any> | undefined
) {
  return useControllerTarget(controller, useContext(Context))
}

/**
 * The props of `Drawer`.
 * @stable
 */
type DrawerProps = DrawerOptions & { children?: JSX.Element }

/**
 * A dialog presented as a sheet that slides in from an edge. Put its trigger, backdrop and content inside.
 * @stable
 */
const Drawer = /* @__PURE__ */ rootScope(function Drawer(props: DrawerProps) {
  const options = omit(props, "children", "container")
  const drawer = usePrimitive(drawerPrimitive, () => ({ ...options }))
  useControllerEntry(() => props.controller, drawer)
  return providePrimitive(drawer, () => (
    <Context value={drawer}>
      <ContainerContext value={() => props.container}>
        {props.children}
      </ContainerContext>
    </Context>
  ))
})

/**
 * The button that opens the drawer. A trigger outside the drawer, like one per table row, connects through
 * `controller`.
 * @stable
 */
function DrawerTrigger(props: TriggerPartProps) {
  const drawer = useDrawerOrRemote(() => props.controller)
  const rest = omit(
    props,
    "disabled",
    "focusableWhenDisabled",
    "payload",
    "shortcut",
    "controller"
  )
  return (
    <TriggerContext value={{ shortcut: () => props.shortcut, drawer }}>
      <Show
        when={drawer()}
        keyed
        // Until the drawer it names mounts, a trigger outside the drawer is a plain button.
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
        {(drawer) => {
          const id = createUniqueId()
          const trigger = () => ({
            id,
            disabled: props.disabled,
            focusableWhenDisabled: props.focusableWhenDisabled,
            payload: props.payload,
            shortcut: props.shortcut,
          })
          return usePart(drawer, "trigger", trigger, rest, "button")
        }}
      </Show>
    </TriggerContext>
  )
}

/**
 * A dim behind the drawer. Its opacity follows the drawer, so give it a color like `bg-black/20`.
 * @stable
 */
function DrawerBackdrop(props: PartProps<"div", DrawerBackdropState>) {
  const target = usePopupContainer(useContext(ContainerContext))
  return popupPart(useDrawer(), "backdrop", () => ({}), props, target)
}

/**
 * The sheet itself, a dialog. It renders inside a full-screen viewport the drawer positions it in.
 * @stable
 */
function DrawerContent<Payload = unknown>(
  props: PartProps<"div", DrawerContentState<Payload>> & DrawerContentProps
) {
  const fromRoot = useContext(ContainerContext)
  const target = usePopupContainer(() => props.container ?? fromRoot())
  const content = () => ({
    initialFocus: props.initialFocus,
    finalFocus: props.finalFocus,
    keepMounted: props.keepMounted,
  })
  const rest = omit(
    props,
    "initialFocus",
    "finalFocus",
    "keepMounted",
    "container"
  )
  return popupPart(useDrawer(), "content", content, rest, target, sheetViewport)
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
function DrawerShortcut(
  props: PartProps<"span", DialogShortcutState> & DialogShortcutProps
) {
  const trigger = useContext(TriggerContext)
  const context = useContext(Context)
  if (!context && !trigger) {
    throw new Error("Drawer parts must be used inside <Drawer>.")
  }
  // A trigger outside the drawer finds it through its controller only once
  // mounted, so inside one whose drawer hasn't mounted yet, there's no
  // shortcut to show, as on the server.
  const drawer = () => context ?? trigger?.drawer()
  const shortcut = () => ({ shortcut: props.shortcut ?? trigger?.shortcut() })
  const rest = merge(omit(props, "shortcut"), {
    get children() {
      return props.children ?? ((state: DialogShortcutState) => state.text)
    },
  })
  return (
    <Show when={drawer()} keyed>
      {(drawer) => usePart(drawer, "shortcut", shortcut, rest, "span")}
    </Show>
  )
}

/**
 * An element that follows the drawer, like the page behind it: it plays its
 * `keyframes` as the drawer expands and gets the `--drawer-*` variables.
 * Outside the drawer, pass the drawer's `controller`.
 * @stable
 */
function DrawerOutlet(props: OutletPartProps) {
  const drawer = useDrawerOrRemote(() => props.controller)
  const id = createUniqueId()
  const outlet = () => ({ id, keyframes: props.keyframes })
  const rest = omit(props, "keyframes", "controller")
  return (
    <Show
      when={drawer()}
      keyed
      fallback={renderStatic(
        "div",
        () => ({ attrs: {}, state: { open: false } }),
        rest
      )}
    >
      {(drawer) => usePart(drawer, "outlet", outlet, rest, "div")}
    </Show>
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
