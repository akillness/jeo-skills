<!--
@component
A <nav> landmark. Inside another menu's content it's a nested menu, which
renders a <div> and closes with its parent.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    navigationMenu as navigationMenuPrimitive,
    type NavigationMenuController,
    type NavigationMenuState,
    type NavigationMenuValueChangeReason,
  } from "@ui-sdk/core/navigation-menu"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import type { PopupContainer } from "../popup.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import {
    ContainerKey,
    ItemKey,
    type ContainerContext,
    type ItemContext,
    type NavigationMenuContext,
  } from "./context"

  type Details = ChangeDetails<NavigationMenuValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    delay,
    closeDelay,
    openOnHover,
    closeOnSelect,
    orientation,
    controller,
    debug,
    container,
    onValueChange,
    onOpenChangeComplete,
    ...rest
  }: PartProps<"nav", NavigationMenuState> & {
    /** The open item's value. Bind it with `bind:value` to control the menu. `null` closes every panel. */
    value?: string | null
    /** The item open at first, when uncontrolled. */
    defaultValue?: string | null
    /** Milliseconds the pointer rests on a trigger before its panel opens. */
    delay?: number
    /** Milliseconds before the open panel closes once the pointer leaves its trigger and the panel. */
    closeDelay?: number
    /** Whether resting the pointer on a trigger opens its panel. `false` makes a click-only menu. */
    openOnHover?: boolean
    /** Whether pressing a link closes the menu. A link's own `closeOnSelect` wins. */
    closeOnSelect?: boolean
    /** Which arrow keys move between the top-level items, and the side panels open on. */
    orientation?: "horizontal" | "vertical"
    /** Opens and closes panels from anywhere. Create one with `createNavigationMenuController()`. */
    controller?: NavigationMenuController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the popups into this element instead of in place. */
    container?: PopupContainer
    /** Runs when an item wants to open or the open one to close. `details.reason` says why, and `details.cancel()` stops it. */
    onValueChange?: (value: string | null, details: Details) => void
    /** Runs once the menu has finished opening or closing, after any animation. Switching items doesn't count. */
    onOpenChangeComplete?: (open: boolean) => void
  } = $props()

  const id = $props.id()
  const parentMenu = getContext<NavigationMenuContext | undefined>(
    navigationMenuPrimitive
  )
  const parentItem = getContext<ItemContext | undefined>(ItemKey)?.() ?? null
  const parent =
    parentMenu && parentItem !== null
      ? { api: parentMenu.api, item: parentItem }
      : undefined
  const menu = usePrimitive(navigationMenuPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    delay,
    closeDelay,
    openOnHover,
    closeOnSelect,
    orientation,
    controller,
    debug,
    parent,
    onValueChange: (next: string | null, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onOpenChangeComplete,
  }))
  provideInstance(navigationMenuPrimitive, menu)
  setContext<ItemContext>(ItemKey, () => null)
  setContext<ContainerContext>(ContainerKey, () => container)
  const root = useHandlePart(menu, "root")
</script>

<Part tag={parent ? "div" : "nav"} part={root} props={rest} />
