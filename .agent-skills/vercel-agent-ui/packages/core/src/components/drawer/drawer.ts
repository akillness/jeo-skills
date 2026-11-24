// Drawer: a dialog presented as a sheet. Dialog's behavior and parts (focus,
// dismissal, nesting, Close actions, controllers that await a result) plus
// the sheet presentation from `popups/sheet.ts`: snap points, dragging with iOS
// physics, a handle, modality that follows the snap point, the keyboard, and
// stacked sheets pushing back the one beneath.
import { dev, warn } from "#dev"
import { checkName } from "#name-check"
import {
  ownContent,
  type DialogApi,
  type DialogState,
} from "../dialog/dialog-api"
import { dialogSlots } from "../dialog/dialog-parts"
import type {
  DialogBackdropState,
  DialogContentProps,
  DialogContentState,
  DialogDismissReason,
  DialogOpenChangeDetails,
  DialogOpenChangeReason,
  DialogPayloadChangeReason,
  DialogSharedOptions,
  DialogTriggerProps,
} from "../dialog/dialog"
import { initialApple } from "../../foundation/platform/platform"
import {
  createPopupController,
  popupContentAttrs,
  type PopupController,
} from "../../foundation/popups/popup"
import { modalAttribute } from "../../foundation/popups/modal-attribute"
import {
  ownsEvent,
  registerPopupElement,
} from "../../foundation/popups/popup-elements"
import { settleFlag } from "../../foundation/kernel/bound-keys"
import type {
  SheetDriverName,
  SheetKeyframes,
  SheetSide,
} from "../../foundation/popups/sheet"
import {
  physicalSide,
  type PhysicalSide,
} from "../../foundation/platform/sides"
import {
  defaultSnap,
  drawerApi,
  handleTouchAction,
  interactiveByOrder,
  type DrawerApi,
  type DrawerState,
} from "./drawer-api"
import type { SheetPhysics } from "../../foundation/motion/physics"
import type { SnapPoint } from "../../foundation/motion/snap-points"
import { openAttrs } from "../../foundation/kernel/attrs"
import type {
  ChangeDetails,
  ChangeOptions,
  DismissAttemptDetails,
  DismissReason,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  SlotDefinition,
} from "../../foundation/kernel/primitive-types"
import { live } from "../../foundation/kernel/live"

/**
 * Why a drawer opened or closed.
 * @stable
 */
type DrawerOpenChangeReason = DialogOpenChangeReason | "swipe"

/**
 * Why the drawer's payload changed: a trigger opened it, another trigger took a non-modal one over while open, or a controller opened it.
 * @stable
 */
type DrawerPayloadChangeReason = DialogPayloadChangeReason

/**
 * Why a drawer moved to another snap point.
 * @stable
 */
type DrawerSnapPointChangeReason =
  | "swipe"
  | "handle-press"
  | "handle-key"
  | "content-resize"
  | "back"
  | "imperative"

/**
 * The ways a user can dismiss a drawer, which `dismissible` can refuse.
 * @stable
 */
type DrawerDismissReason = DialogDismissReason | Extract<DismissReason, "swipe">

/**
 * What `onDismissAttempt` receives when a dismissal was refused.
 * @stable
 */
type DrawerDismissAttemptDetails = DismissAttemptDetails<DrawerDismissReason>

/**
 * Opens, closes, moves and inspects a drawer from anywhere.
 * @stable
 */
type DrawerController<Payload = unknown, Result = string> = PopupController<
  Payload,
  DrawerOpenChangeReason,
  {},
  Result,
  DrawerPayloadChangeReason
> & {
  /** The snap point it rests on, or null before it first opens. */
  getSnapPoint: () => SnapPoint | null
  /**
   * Moves it to a snap point. While closed, it opens there next.
   * Returns false when the change was canceled or it was already there.
   */
  setSnapPoint: (
    snapPoint: SnapPoint,
    options?: ChangeOptions<DrawerSnapPointChangeReason>
  ) => boolean
}

/**
 * Opens, closes and moves a drawer from outside it: a menu item, a hotkey, a
 * test, or triggers anywhere on the page. Pass it as the `controller` option.
 * `open()` resolves once the drawer closes, with why and any return value.
 * @stable
 */
function createDrawerController<Payload = unknown, Result = string>() {
  return createPopupController<
    Payload,
    DrawerOpenChangeReason,
    {},
    Result,
    DrawerPayloadChangeReason
  >() as DrawerController<Payload, Result>
}

/**
 * The options `drawer` takes. A component takes them as props on its root.
 * @stable
 */
type DrawerOptions = Omit<DialogSharedOptions, "onDismissAttempt"> & {
  /** Runs when the drawer wants to open or close. `details.reason` says why, `"swipe"` included, `details.cancel()` stops it, and `details.returnValue` carries what closed it. */
  onOpenChange?: (
    open: boolean,
    details: DialogOpenChangeDetails<DrawerOpenChangeReason>
  ) => void
  /**
   * Runs when the payload the content shows changes: a trigger with another payload opens the
   * drawer, or takes a non-modal drawer over while it's open, which fires no `onOpenChange`, and so
   * does a controller's `open({ payload })` on the open drawer. `details.cancel()` keeps the previous payload.
   */
  onPayloadChange?: (
    payload: unknown,
    details: ChangeDetails<DrawerPayloadChangeReason>
  ) => void
  /** Runs when a dismissal was refused because `dismissible` is false, including a swipe. The drawer resists and springs back. Ask "Discard changes?" here. */
  onDismissAttempt?: (details: DrawerDismissAttemptDetails) => void
  /**
   * `true`: the rest of the page is inert and doesn't scroll, focus is trapped, and an outside press only closes the drawer. `"trap-focus"`: traps focus and leaves the page usable. `false`: a drawer beside the page. See `modalAbove` to make it modal only above a snap point.
   * @defaultValue true
   */
  modal?: boolean | "trap-focus"
  /**
   * Whether pressing outside the drawer, like on its backdrop, closes it.
   * @defaultValue true, or false while the drawer isn't modal
   */
  closeOnOutsidePress?: boolean
  /** Opens, closes and moves the drawer from anywhere, and connects triggers and outlets outside it. Create one with `createDrawerController()`. */
  controller?: DrawerController<any, any>
  /**
   * Where the drawer can rest, from the edge it comes from: a fraction of the screen up to 1, pixels above 1, `"…px"`, `"…rem"`, `"…%"`, or `"content"` for its own size. None can be larger than the drawer, which you size with CSS.
   * @defaultValue ["content"]
   */
  snapPoints?: SnapPoint[]
  /** The snap point it rests on. Pass it to control it. */
  snapPoint?: SnapPoint | null
  /**
   * The snap point it opens at, when uncontrolled. It opens there again each time.
   * @defaultValue the first of `snapPoints`
   */
  defaultSnapPoint?: SnapPoint
  /** Runs when the drawer moves to another snap point. `details.reason` says why: a swipe, the handle, the keyboard, a resize or the controller. */
  onSnapPointChange?: (
    snapPoint: SnapPoint,
    details: ChangeDetails<DrawerSnapPointChangeReason>
  ) => void
  /**
   * The edge it comes from. `"start"` and `"end"` follow the writing direction.
   * @defaultValue "bottom"
   */
  side?: SheetSide
  /** At or below this snap point the page stays usable and undimmed, like Maps: no inert page, no scroll lock, no `aria-modal`, and presses beside the drawer reach the page. Above it, `modal` applies. Changes once the drawer comes to rest. */
  modalAbove?: SnapPoint
  /**
   * How it moves. `"pointer"` follows touch, mouse and pen with a spring fitted to iOS. `"scroll-snap"` uses the browser's own scrolling for bottom drawers. `"auto"` picks scroll snap for a bottom drawer on a touch screen, unless `modalAbove` is set or `expandOnScroll` is false, and the pointer driver otherwise.
   * @defaultValue "auto"
   */
  driver?: SheetDriverName
  /**
   * Whether dragging toward a larger snap point on scrollable content moves the drawer first, until it's at its largest.
   * @defaultValue true
   */
  expandOnScroll?: boolean
  /** Overrides the motion: spring, projection, rubber band and dim. Starts from `sheetPhysics.ios`. */
  physics?: Partial<SheetPhysics>
  /**
   * Whether `<meta name="theme-color">` dims with the backdrop, so Safari's toolbars darken too. Written where motion starts and ends, never per frame.
   * @defaultValue false
   */
  themeColor?: boolean
  /**
   * Whether presses on the drawer near the screen's left and right edges are kept from starting iOS Safari's back and forward swipe. Taps right at those edges then don't click. Read when the content mounts.
   * @defaultValue false
   */
  preventEdgeSwipe?: boolean
}

type OutletProps = {
  /** Keyframes it plays as the drawer expands, like `{ scale: [1, 0.94] }`: the first while collapsed, the last at the largest snap point. They run on the compositor when they're transforms or opacity. */
  keyframes?: SheetKeyframes
}

/**
 * The props the `content` slot of `drawer` takes.
 * @stable
 */
type DrawerContentProps = Omit<DialogContentProps, "inline">
/**
 * The props the `outlet` slot of `drawer` takes.
 * @stable
 */
type DrawerOutletProps = OutletProps & {
  /** Connects an outlet outside the drawer, like the app's shell, to the drawer with this controller. */
  controller?: DrawerController<any, any>
}

/**
 * The props the `trigger` slot of `drawer` takes.
 * @stable
 */
type DrawerTriggerProps = Omit<DialogTriggerProps, "controller"> & {
  /** Connects a trigger outside the drawer, like one per table row, to the drawer with this controller. */
  controller?: DrawerController<any, any>
}

/**
 * The state the `content` slot of `drawer` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DrawerContentState<Payload = unknown> = Omit<
  DialogContentState<Payload>,
  "presentation"
> & {
  /** The snap point it rests on or is moving to. */
  snapPoint: SnapPoint | null
  /** Whether it's at its largest snap point. */
  expanded: boolean
  /** Whether a finger, mouse or pen is dragging it. */
  dragging: boolean
  /** The edge it comes from, with `start` and `end` resolved. */
  side: PhysicalSide
  /** Whether the page behind is usable, because it rests at or below `modalAbove`. */
  interactive: boolean
}
/**
 * The state the `backdrop` slot of `drawer` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DrawerBackdropState = DialogBackdropState & {
  /** Whether the page behind is usable, so the backdrop lets presses through. */
  interactive: boolean
}
/**
 * The state the `handle` slot of `drawer` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DrawerHandleState = {
  /** The snap point it rests on. */
  snapPoint: SnapPoint | null
  /** Whether there's a larger snap point to move to. */
  canExpand: boolean
  /** Whether there's a smaller snap point to move to. */
  canCollapse: boolean
}
/**
 * The state the `outlet` slot of `drawer` hands `render` functions and
 * state-based class names.
 * @stable
 */
type DrawerOutletState = {
  /** Whether the drawer is open. False as soon as it starts closing, while it still animates out. */
  open: boolean
}

const handleKeys: Record<string, Record<string, "expand" | "collapse">> = {
  bottom: { ArrowUp: "expand", ArrowDown: "collapse" },
  top: { ArrowDown: "expand", ArrowUp: "collapse" },
  left: { ArrowRight: "expand", ArrowLeft: "collapse" },
  right: { ArrowLeft: "expand", ArrowRight: "collapse" },
}

// A snap point from an attribute: numbers as numbers, like "0.5", and the
// rest as written, like "content".
function snapPointOf(value: string) {
  const trimmed = value.trim()
  return (/^[\d.]+$/.test(trimmed) ? Number(trimmed) : trimmed) as SnapPoint
}
const snapPointAttribute = (attribute: string | null) =>
  attribute === null ? undefined : snapPointOf(attribute)
// Comma-separated, like "0.5,1".
const snapPointsAttribute = (attribute: string | null) =>
  attribute?.split(",").map(snapPointOf)

// Dialog's parts, as the drawer's: they only read Dialog's state and api,
// which the drawer's extend.
function reuse<Props, Public>(
  definition: SlotDefinition<DialogState, DialogApi, Props, Public>
) {
  return definition as unknown as SlotDefinition<
    DrawerState,
    DrawerApi,
    Props,
    Public
  >
}

const drawerPrimitive = /* @__PURE__ */ definePrimitive({
  name: "drawer",
  options: {
    container: "value",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChangeComplete: "callback",
    dismissible: "boolean",
    onDismissAttempt: "callback",
    persistentElements: "list",
    pendingAnnouncement: "string",
    onOpenChange: "callback",
    onPayloadChange: "callback",
    modal: modalAttribute,
    closeOnOutsidePress: "boolean",
    controller: "value",
    snapPoints: snapPointsAttribute,
    snapPoint: snapPointAttribute,
    defaultSnapPoint: snapPointAttribute,
    onSnapPointChange: "callback",
    side: "string",
    modalAbove: snapPointAttribute,
    driver: "string",
    expandOnScroll: "boolean",
    physics: "value",
    themeColor: "boolean",
    preventEdgeSwipe: "boolean",
  },
  state: (options: DrawerOptions): DrawerState => {
    const open = options.open ?? options.defaultOpen ?? false
    const snapPoint =
      options.snapPoint !== undefined
        ? options.snapPoint
        : open
          ? defaultSnap(options)
          : null
    const interactive = open && interactiveByOrder(options, snapPoint)
    return {
      open,
      mounted: open,
      // Unknown until the parts bind: the server names an open drawer by its title.
      titled: null,
      described: false,
      trigger: null,
      payload: undefined,
      modal: interactive ? false : (options.modal ?? true),
      nested: false,
      stack: 0,
      pending: null,
      errors: {},
      apple: initialApple(),
      presentation: "sheet",
      snapPoint,
      dragging: false,
      interactive,
      modalSetting: options.modal ?? true,
      side: physicalSide(options.side ?? "bottom", false),
      snapIndex: -1,
      snapCount: options.snapPoints?.length ?? 1,
    }
  },
  live: ["dragging"],
  controlled: ["open", "snapPoint"],
  sync: (options) => ({
    ...(options.open !== undefined && { open: options.open }),
    ...(options.snapPoint !== undefined && { snapPoint: options.snapPoint }),
    modalSetting: options.modal ?? true,
  }),
  api: (context) => drawerApi(context),
  slots: (slot) => {
    const shared = dialogSlots((definition) => definition, { name: "drawer" })
    return {
      trigger: reuse(shared.trigger),
      title: reuse(shared.title),
      description: reuse(shared.description),
      close: reuse(shared.close),
      shortcut: reuse(shared.shortcut),

      backdrop: slot<{}, DrawerBackdropState>({
        state: (state) => ({
          open: state.open,
          nested: state.nested,
          nestedOpen: state.stack > 0,
          interactive: state.interactive,
        }),
        present: (state, { api }) =>
          state.mounted || !!api.internal.contentProps().keepMounted,
        role: "presentation",
        attrs: (state) => ({
          hidden: state.mounted ? undefined : "",
          ...openAttrs(state.open),
          "data-nested": state.nested ? "" : undefined,
          "data-nested-open": state.stack > 0 ? "" : undefined,
          "data-interactive": state.interactive ? "" : undefined,
        }),
        live: live((state) => ({
          "data-dragging": state.dragging ? "" : undefined,
        })),
        bind(el, { api, store }) {
          api.internal.preset.resetStyles?.bind(el)
          // A usable page takes presses through the backdrop.
          const write = () =>
            (el.style.pointerEvents = store.get().interactive ? "none" : "")
          write()
          const off = store.subscribe(write)
          const unbind = api.internal.popup.backdrop(el)
          return () => {
            off()
            unbind()
            el.style.removeProperty("pointer-events")
          }
        },
      }),

      // The full-screen element the content sits in, rendered by the adapters
      // around it. It's what goes into the top layer, and the scroller for
      // the scroll-snap driver.
      viewport: slot<{}, {}>({
        present: (state, { api }) =>
          state.mounted || !!api.internal.contentProps().keepMounted,
        attrs: (state) => ({
          hidden: state.mounted ? undefined : "",
          "data-side": state.side,
          ...openAttrs(state.open),
        }),
      }),

      content: slot<DrawerContentProps, DrawerContentState>({
        props: {
          container: "value",
          initialFocus: "string",
          finalFocus: "string",
          keepMounted: "boolean",
        },
        connect: registerPopupElement,
        role: "dialog",
        state: (state) => ({
          open: state.open,
          modal: state.modal,
          nested: state.nested,
          nestedOpen: state.stack > 0,
          stack: state.stack,
          payload: state.payload,
          pending: state.pending !== null,
          snapPoint: state.snapPoint,
          expanded:
            state.snapCount > 0 && state.snapIndex === state.snapCount - 1,
          dragging: state.dragging,
          side: state.side,
          interactive: state.interactive,
        }),
        present: (state, { props }) => state.mounted || !!props.keepMounted,
        attrs: (state, { id, api }) => ({
          ...popupContentAttrs(state, id),
          ...api.internal.triggerName?.contentAttrs(state, id),
          "aria-describedby": state.described ? `${id}-description` : undefined,
          "data-side": state.side,
          "data-snap-point":
            state.snapPoint === null ? undefined : String(state.snapPoint),
          "data-expanded":
            state.snapCount > 0 && state.snapIndex === state.snapCount - 1
              ? ""
              : undefined,
          "data-interactive": state.interactive ? "" : undefined,
          "data-nested": state.nested ? "" : undefined,
          "data-nested-open": state.stack > 0 ? "" : undefined,
        }),
        live: live((state) => ({
          "data-dragging": state.dragging ? "" : undefined,
        })),
        on: {
          keydown(event, { api, el }) {
            // Keys from a dialog or drawer nested inside bubble through this one. Only the owner handles them.
            if (ownsEvent(el!, event, ownContent)) {
              api.internal.popup.keydown(event)
            }
          },
        },
        bind(el, { api, id, store }) {
          settleFlag(store, "titled")
          if (dev && el.parentElement?.closest("form")) {
            warn(
              "The content renders inside a form, which nests forms. Pass `container` to render it elsewhere.",
              {
                component: "drawer",
                id,
              }
            )
          }
          let detach: (() => void) | undefined
          let cancelled = false
          const start = () => {
            // The viewport the adapters render around the content. Vue sets
            // its attributes only after binding the content, so it's found by place.
            const host = el.parentElement
            if (!host) {
              return
            }
            // The sheet binds before the popup layer shows it, so its opening
            // animation exists before presence starts waiting for animations.
            api.internal.attach(el, host, api.internal.backdropElement)
            const unbind = api.internal.popup.bind(el, {
              initialFocus: api.internal.initialFocus,
              backdrop: api.internal.backdropElement,
              host: () => host,
            })
            detach = () => {
              unbind()
              api.internal.detach()
            }
          }
          // Vue can bind refs before it inserts the element into its parent.
          if (el.parentElement) {
            start()
          } else {
            queueMicrotask(() => {
              if (!cancelled) {
                start()
              }
            })
          }
          return () => {
            cancelled = true
            detach?.()
          }
        },
      }),

      // The grabber: a press goes to the next larger snap point, wrapping;
      // arrow keys along the drawer's axis step without wrapping; Home and
      // End go to the smallest and the largest.
      handle: slot<{}, DrawerHandleState>({
        state: (state) => ({
          snapPoint: state.snapPoint,
          canExpand:
            state.snapIndex >= 0 && state.snapIndex < state.snapCount - 1,
          canCollapse: state.snapIndex > 0,
        }),
        attrs: (state, { id }) => ({
          type: "button",
          "aria-controls": state.mounted ? `${id}-content` : undefined,
          "data-snap-point":
            state.snapPoint === null ? undefined : String(state.snapPoint),
          "data-expanded":
            state.snapCount > 0 && state.snapIndex === state.snapCount - 1
              ? ""
              : undefined,
        }),
        press: ({ api }, event) =>
          api.internal.stepHandle("cycle", "handle-press", event),
        on: {
          keydown(event, { api, store }) {
            const action =
              event.key === "Home"
                ? "first"
                : event.key === "End"
                  ? "last"
                  : handleKeys[store.get().side][event.key]
            if (!action) {
              return
            }
            event.preventDefault()
            api.internal.stepHandle(action, "handle-key", event)
          },
        },
        bind(el, { id }) {
          // Touch drags on the handle always move the drawer, never the page.
          el.style.touchAction = handleTouchAction(el)
          checkName(el, "The handle", { component: "drawer", id })
          return () => el.style.removeProperty("touch-action")
        },
      }),

      // An element that follows the drawer, like the page behind it, through
      // its keyframes and the `--drawer-*` variables.
      outlet: slot<OutletProps, DrawerOutletState>({
        props: { id: "id", keyframes: "value" },
        state: (state) => ({ open: state.open }),
        attrs: (state) => openAttrs(state.open),
        bind(el, { api, key }) {
          return api.internal.registerOutlet(el, key)
        },
      }),
    }
  },
  agent: { actions: ["setOpen", "setSnapPoint"] },
})

/**
 * The type of `drawer`.
 * @stable
 */
interface DrawerPrimitive extends Named<typeof drawerPrimitive> {}

/**
 * The drawer primitive, with the slots `trigger`, `title`, `description`,
 * `close`, `shortcut`, `backdrop`, `viewport`, `content`, `handle`, `outlet`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const drawer: DrawerPrimitive = drawerPrimitive

export {
  createDrawerController,
  drawer,
  type DrawerBackdropState,
  type DrawerContentProps,
  type DrawerContentState,
  type DrawerController,
  type DrawerDismissAttemptDetails,
  type DrawerDismissReason,
  type DrawerHandleState,
  type DrawerOpenChangeReason,
  type DrawerOptions,
  type DrawerOutletProps,
  type DrawerOutletState,
  type DrawerPayloadChangeReason,
  type DrawerPrimitive,
  type DrawerSnapPointChangeReason,
  type DrawerTriggerProps,
}
export type { DrawerApi } from "./drawer-api"
export {
  sheetPhysics,
  type SheetPhysics,
} from "../../foundation/motion/physics"
export type { SnapPoint } from "../../foundation/motion/snap-points"
export type {
  SheetDriverName as DrawerDriver,
  SheetKeyframes as DrawerKeyframes,
  SheetSide as DrawerSide,
} from "../../foundation/popups/sheet"
