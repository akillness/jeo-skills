<!--
@component
Rich content in a floating panel, opened from a button. Put its trigger and content inside.
@stable
-->
<script lang="ts">
  import type { ChangeDetails, DismissAttemptDetails } from "@ui-sdk/core"
  import {
    popover as popoverPrimitive,
    type PopoverController,
    type PopoverDismissReason,
    type PopoverOpenChangeReason,
    type PopoverPayloadChangeReason,
  } from "@ui-sdk/core/popover"
  import { setContext, type Snippet } from "svelte"
  import { provideInstance } from "../instance"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { usePrimitive } from "../use-primitive.svelte"
  import { ContainerKey } from "./context"

  type OpenDetails = ChangeDetails<PopoverOpenChangeReason>
  type PayloadDetails = ChangeDetails<PopoverPayloadChangeReason>

  let {
    open = $bindable(),
    defaultOpen,
    modal,
    openOnHover,
    delay,
    closeDelay,
    presentation,
    controller,
    dismissible,
    debug,
    container,
    onOpenChange,
    onOpenChangeComplete,
    onPayloadChange,
    onDismissAttempt,
    children,
  }: {
    /** Whether the popover is open. Bind it with `bind:open` to control the popover. */
    open?: boolean
    /** Whether the popover starts open, when uncontrolled. */
    defaultOpen?: boolean
    /** `false` keeps the page usable, `true` traps focus and makes the page inert, `"trap-focus"` only traps focus. */
    modal?: boolean | "trap-focus"
    /** Whether resting the pointer on the trigger opens the popover. */
    openOnHover?: boolean
    /** Milliseconds the pointer rests on the trigger before the popover opens, with `openOnHover`. */
    delay?: number
    /** Milliseconds before the popover closes once the pointer leaves it, with `openOnHover`. */
    closeDelay?: number
    /** How the popover presents: a popover, a sheet, or `"auto"` for a sheet on small touch screens. */
    presentation?: "auto" | "popover" | "sheet"
    /** Opens, closes and inspects the popover from anywhere. Create one with `createPopoverController()`. */
    controller?: PopoverController<any>
    /** Whether Escape, an outside press, focus or the window leaving, Android's back gesture, the screen reader's escape gesture and a swipe on a sheet can close the popover. Triggers, Close parts and the controller always can. */
    dismissible?: boolean
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the popup into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the popover wants to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the popover has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the payload the content shows changes. `details.cancel()` keeps the previous one. */
    onPayloadChange?: (payload: unknown, details: PayloadDetails) => void
    /** Runs when `dismissible` refused a dismissal made on purpose: Escape, an outside press, back, the screen reader's escape or a swipe. Focus or the window leaving is refused without it. */
    onDismissAttempt?: (
      details: DismissAttemptDetails<PopoverDismissReason>
    ) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  setContext(ContainerKey, () => container)
  const popover = usePrimitive(popoverPrimitive, () => ({
    id,
    get open() {
      return open
    },
    defaultOpen,
    modal,
    openOnHover,
    delay,
    closeDelay,
    presentation,
    controller,
    dismissible,
    debug,
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
  }))
  useControllerEntry(() => controller, popover)
  provideInstance(popoverPrimitive, popover)
</script>

{@render children?.()}
