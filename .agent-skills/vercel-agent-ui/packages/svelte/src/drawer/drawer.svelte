<!--
@component
A dialog presented as a sheet that slides in from an edge. Put its trigger, backdrop and content inside.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import type { DialogOpenChangeDetails } from "@ui-sdk/core/dialog"
  import {
    drawer as drawerPrimitive,
    type DrawerController,
    type DrawerDismissAttemptDetails,
    type DrawerDriver,
    type DrawerOpenChangeReason,
    type DrawerPayloadChangeReason,
    type DrawerSide,
    type DrawerSnapPointChangeReason,
    type SheetPhysics,
    type SnapPoint,
  } from "@ui-sdk/core/drawer"
  import { setContext, type Snippet } from "svelte"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { usePrimitive } from "../use-primitive.svelte"
  import { DrawerKey, type DrawerContext } from "./context"

  type OpenDetails = DialogOpenChangeDetails<DrawerOpenChangeReason>
  type SnapDetails = ChangeDetails<DrawerSnapPointChangeReason>

  let {
    open = $bindable(),
    defaultOpen,
    modal,
    closeOnOutsidePress,
    controller,
    dismissible,
    persistentElements,
    pendingAnnouncement,
    debug,
    container,
    snapPoints,
    snapPoint = $bindable(),
    defaultSnapPoint,
    side,
    modalAbove,
    driver,
    expandOnScroll,
    physics,
    themeColor,
    preventEdgeSwipe,
    onOpenChange,
    onOpenChangeComplete,
    onPayloadChange,
    onDismissAttempt,
    onSnapPointChange,
    children,
  }: {
    /** Whether the drawer is open. Bind it with `bind:open` to control the drawer. */
    open?: boolean
    /** Whether the drawer starts open, when uncontrolled. Focus moves into it once it's on the page. */
    defaultOpen?: boolean
    /** `true`: the rest of the page is inert and doesn't scroll, focus is trapped, and an outside press only closes the drawer. `"trap-focus"`: traps focus and leaves the page usable. `false`: a drawer beside the page. See `modalAbove` to make it modal only above a snap point. */
    modal?: boolean | "trap-focus"
    /** Whether pressing outside the drawer, like on its backdrop, closes it. */
    closeOnOutsidePress?: boolean
    /** Opens, closes and moves the drawer from anywhere, and connects triggers and outlets outside it. Create one with `createDrawerController()`. */
    controller?: DrawerController<any, any>
    /** Whether Escape, an outside press, a swipe, Android's back gesture and the screen reader's escape gesture can close the drawer. Close parts, triggers and the controller always can. */
    dismissible?: boolean
    /** Elements that stay usable while the drawer makes the page inert. Elements, CSS selectors, or a function that returns elements, read when the drawer opens. */
    persistentElements?: (Element | string)[] | (() => Element[])
    /** What screen readers hear once a Close part's action has been running for a second. Set it in the page's language. An empty string says nothing. */
    pendingAnnouncement?: string
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the drawer into this element instead of in place. */
    container?: PopupContainer
    /** Where the drawer can rest, from the edge it comes from: a fraction of the screen up to 1, pixels above 1, `"…px"`, `"…rem"`, `"…%"`, or `"content"` for its own size. */
    snapPoints?: SnapPoint[]
    /** The snap point it rests on. Bind it with `bind:snapPoint` to control it. */
    snapPoint?: SnapPoint | null
    /** The snap point it opens at, when uncontrolled. It opens there again each time. */
    defaultSnapPoint?: SnapPoint
    /** The edge it comes from. `"start"` and `"end"` follow the writing direction. */
    side?: DrawerSide
    /** At or below this snap point the page stays usable and undimmed, like Maps. Above it, `modal` applies. */
    modalAbove?: SnapPoint
    /** How it moves. `"pointer"` follows touch, mouse and pen with a spring fitted to iOS. `"scroll-snap"` uses the browser's own scrolling for bottom drawers. `"auto"` picks for the device. */
    driver?: DrawerDriver
    /** Whether dragging toward a larger snap point on scrollable content moves the drawer first, until it's at its largest. */
    expandOnScroll?: boolean
    /** Overrides the motion: spring, projection, rubber band and dim. Starts from `sheetPhysics.ios`. */
    physics?: Partial<SheetPhysics>
    /** Whether `<meta name="theme-color">` dims with the backdrop, so Safari's toolbars darken too. */
    themeColor?: boolean
    /** Whether presses on the drawer near the screen's left and right edges are kept from starting iOS Safari's back and forward swipe. */
    preventEdgeSwipe?: boolean
    /** Runs when the drawer wants to open or close. `details.reason` says why, `"swipe"` included, `details.cancel()` stops it, and `details.returnValue` carries what closed it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the drawer has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the payload the content shows changes. `details.cancel()` keeps the previous payload. */
    onPayloadChange?: (
      payload: unknown,
      details: ChangeDetails<DrawerPayloadChangeReason>
    ) => void
    /** Runs when a dismissal was refused because `dismissible` is false, including a swipe. The drawer resists and springs back. */
    onDismissAttempt?: (details: DrawerDismissAttemptDetails) => void
    /** Runs when the drawer moves to another snap point. `details.reason` says why: a swipe, the handle, the keyboard, a resize or the controller. */
    onSnapPointChange?: (snapPoint: SnapPoint, details: SnapDetails) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  const handle = usePrimitive(drawerPrimitive, () => ({
    id,
    get open() {
      return open
    },
    defaultOpen,
    modal,
    closeOnOutsidePress,
    controller,
    dismissible,
    persistentElements,
    pendingAnnouncement,
    debug,
    snapPoints,
    get snapPoint() {
      return snapPoint
    },
    defaultSnapPoint,
    side,
    modalAbove,
    driver,
    expandOnScroll,
    physics,
    themeColor,
    preventEdgeSwipe,
    onOpenChange: (next: boolean, details: OpenDetails) => {
      // The callback runs first, so canceling there also keeps a bound `open` as it was.
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
    onPayloadChange,
    onDismissAttempt,
    onSnapPointChange: (next: SnapPoint, details: SnapDetails) => {
      onSnapPointChange?.(next, details)
      if (!details.canceled) {
        snapPoint = next
      }
    },
  }))
  const context: DrawerContext = { handle, container: () => container }
  useControllerEntry(() => controller, context)
  setContext(DrawerKey, context)
</script>

{@render children?.()}
