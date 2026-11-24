<!--
@component
A submenu. Put its `MenuSubTrigger` and `MenuSubContent` inside, in a menu's content.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    menu as menuPrimitive,
    type MenuController,
    type MenuOpenChangeReason,
  } from "@ui-sdk/core/menu"
  import type { Snippet } from "svelte"
  import { provideInstance, useHandle } from "../instance"
  import { usePrimitive } from "../use-primitive.svelte"

  type OpenDetails = ChangeDetails<MenuOpenChangeReason>

  let {
    open = $bindable(),
    defaultOpen,
    delay,
    loop,
    controller,
    debug,
    onOpenChange,
    onOpenChangeComplete,
    children,
  }: {
    /** Whether the submenu is open. Bind it with `bind:open` to control the submenu. */
    open?: boolean
    /** Whether the submenu starts open, when uncontrolled. */
    defaultOpen?: boolean
    /** Milliseconds the pointer rests on a submenu trigger inside before its submenu opens. */
    delay?: number
    /** Whether arrow keys wrap from the last item to the first. */
    loop?: boolean
    /** Opens, closes and inspects the submenu. Create one with `createMenuController()`. Triggers outside the menu can't connect to it. */
    controller?: MenuController<any>
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when the submenu wants to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the submenu has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    children?: Snippet
  } = $props()

  const parent = useHandle(menuPrimitive)
  const id = $props.id()
  const menu = usePrimitive(menuPrimitive, () => ({
    id,
    get open() {
      return open
    },
    defaultOpen,
    delay,
    loop,
    controller,
    debug,
    parent: parent.api,
    onOpenChange: (next: boolean, details: OpenDetails) => {
      // The callback runs first, so canceling there also keeps a bound `open` as it was.
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
  }))
  provideInstance(menuPrimitive, menu)
</script>

{@render children?.()}
