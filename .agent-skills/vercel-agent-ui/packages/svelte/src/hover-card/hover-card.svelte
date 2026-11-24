<!--
@component
A preview of what a link points to, shown when the pointer rests on the link or keyboard focus stays on it.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    hoverCard as hoverCardPrimitive,
    type HoverCardController,
    type HoverCardOpenChangeReason,
    type HoverCardPayloadChangeReason,
  } from "@ui-sdk/core/hover-card"
  import { setContext, type Snippet } from "svelte"
  import { provideInstance } from "../instance"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { usePrimitive } from "../use-primitive.svelte"
  import { ContainerKey } from "./context"

  type OpenDetails = ChangeDetails<HoverCardOpenChangeReason>
  type PayloadDetails = ChangeDetails<HoverCardPayloadChangeReason>

  let {
    open = $bindable(),
    defaultOpen,
    delay,
    closeDelay,
    disabled,
    controller,
    debug,
    container,
    onOpenChange,
    onOpenChangeComplete,
    onPayloadChange,
    children,
  }: {
    /** Whether the card is open. Bind it with `bind:open` to control the card. */
    open?: boolean
    /** Whether the card starts open, when uncontrolled. */
    defaultOpen?: boolean
    /** Milliseconds the pointer rests on the trigger, or keyboard focus stays on it, before the card opens. */
    delay?: number
    /** Milliseconds before the card closes once the pointer leaves the trigger and the card. */
    closeDelay?: number
    /** Stops the card from opening. The trigger keeps working as a link. */
    disabled?: boolean
    /** Opens, closes and inspects the card from anywhere, and connects triggers outside it. Create one with `createHoverCardController()`. */
    controller?: HoverCardController<any>
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the popup into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the card wants to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the card has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the payload the content shows changes. `details.cancel()` keeps the previous one. */
    onPayloadChange?: (payload: unknown, details: PayloadDetails) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  setContext(ContainerKey, () => container)
  const hoverCard = usePrimitive(hoverCardPrimitive, () => ({
    id,
    get open() {
      return open
    },
    defaultOpen,
    delay,
    closeDelay,
    disabled,
    controller,
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
  }))
  useControllerEntry(() => controller, hoverCard)
  provideInstance(hoverCardPrimitive, hoverCard)
</script>

{@render children?.()}
