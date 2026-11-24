<!--
@component
A list of actions and options, opened from a button or a right-click. Put its trigger and content inside.
@stable
-->
<script lang="ts">
  import type { ChangeDetails, DismissAttemptDetails } from "@ui-sdk/core"
  import {
    menu as menuPrimitive,
    type MenuActionDetails,
    type MenuCheckedChangeDetails,
    type MenuController,
    type MenuData,
    type MenuDismissReason,
    type MenuOpenChangeReason,
    type MenuPayloadChangeReason,
    type MenuValueChangeDetails,
  } from "@ui-sdk/core/menu"
  import { getContext, setContext, type Snippet } from "svelte"
  import { provideInstance } from "../instance"
  import { MenubarKey, type MenubarContext } from "../menubar-context"
  import { useOwnPart } from "../own-part.svelte"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { usePrimitive } from "../use-primitive.svelte"
  import { ContainerKey, OwnContentKey } from "./context"
  import MenuContent from "./menu-content.svelte"
  import MenuItems from "./menu-items.svelte"

  type OpenDetails = ChangeDetails<MenuOpenChangeReason>
  type PayloadDetails = ChangeDetails<MenuPayloadChangeReason>

  let {
    open = $bindable(),
    defaultOpen,
    items,
    itemShortcuts,
    loop,
    delay,
    presentation,
    modal,
    controller,
    dismissible,
    debug,
    container,
    onOpenChange,
    onOpenChangeComplete,
    onPayloadChange,
    onAction,
    pendingAnnouncement,
    onCheckedChange,
    onValueChange,
    onDismissAttempt,
    children,
  }: {
    /** Whether the menu is open. Bind it with `bind:open` to control the menu. */
    open?: boolean
    /** Whether the menu starts open, when uncontrolled. */
    defaultOpen?: boolean
    /** The menu as data. Renders the content for you, unless you place a `MenuContent` of your own, and runs the items' shortcuts. */
    items?: MenuData
    /** Whether a data menu runs its items' shortcuts while closed. */
    itemShortcuts?: boolean
    /** Whether arrow keys wrap from the last item to the first. */
    loop?: boolean
    /** Milliseconds the pointer rests on a submenu trigger before its submenu opens. */
    delay?: number
    /** How the menu presents: a popover, a sheet, or `"auto"` for a sheet on small touch screens. */
    presentation?: "auto" | "popover" | "sheet"
    /** `"pointer"`: an outside press only closes the menu. `true`: also locks scroll, traps focus and makes the page inert. `false`: outside presses reach what they hit. */
    modal?: boolean | "pointer"
    /** Opens, closes and inspects the menu from anywhere, and connects triggers outside it. Create one with `createMenuController()`. */
    controller?: MenuController<any>
    /** Whether Escape, an outside press, focus or the window leaving, Android's back gesture, the screen reader's escape gesture and a swipe on a sheet can close the menu. Triggers, items and the controller always can. */
    dismissible?: boolean
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the popup into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the menu wants to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the menu has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the payload the content shows changes. `details.cancel()` keeps the previous one. */
    onPayloadChange?: (payload: unknown, details: PayloadDetails) => void
    /** Runs for every plain item, including items in submenus, with the item's value. Return a Promise to keep the item pending, and the menu open, until it settles. */
    onAction?: (value: string, details: MenuActionDetails) => unknown
    /** What screen readers hear once an item has been pending for a second. An empty string says nothing. */
    pendingAnnouncement?: string
    /** Runs when any checkbox item in the menu or its submenus toggles, with the item's value in `details.value`. */
    onCheckedChange?: (
      checked: boolean,
      details: MenuCheckedChangeDetails
    ) => void
    /** Runs when any radio group in the menu or its submenus changes, with the group in `details.group`. */
    onValueChange?: (value: string, details: MenuValueChangeDetails) => void
    /** Runs when `dismissible` refused a dismissal made on purpose: Escape, an outside press, back, the screen reader's escape or a swipe. Focus or the window leaving is refused without it. */
    onDismissAttempt?: (
      details: DismissAttemptDetails<MenuDismissReason>
    ) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  setContext(ContainerKey, () => container)
  const menubar = getContext<MenubarContext | undefined>(MenubarKey)
  // A menu inside this one's content is no item of the menubar.
  setContext<MenubarContext>(MenubarKey, null)
  const menu = usePrimitive(menuPrimitive, () => ({
    id,
    get open() {
      return open
    },
    defaultOpen,
    items,
    itemShortcuts,
    loop,
    delay,
    presentation,
    modal,
    controller,
    dismissible,
    debug,
    menubar: menubar ? () => menubar.api : undefined,
    onOpenChange: (next: boolean, details: OpenDetails) => {
      // The callback runs first, so canceling there also keeps a bound `open` as it was.
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
    onPayloadChange,
    onAction,
    pendingAnnouncement,
    onCheckedChange,
    onValueChange,
    onDismissAttempt,
  }))
  useControllerEntry(() => controller, menu)
  provideInstance(menuPrimitive, menu)
  // A data menu renders its content, unless a MenuContent is among the children.
  const own = useOwnPart(OwnContentKey)
</script>

{@render children?.()}
{#if items && !own()}
  <MenuContent fromRoot><MenuItems {items} /></MenuContent>
{/if}
