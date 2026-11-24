<!--
@component
A short label or hint that appears when the pointer rests on its trigger or keyboard focus reaches it.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    tooltip as tooltipPrimitive,
    type TooltipController,
    type TooltipOpenChangeReason,
    type TooltipPayloadChangeReason,
  } from "@ui-sdk/core/tooltip"
  import { setContext, type Snippet } from "svelte"
  import { provideInstance } from "../instance"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { usePrimitive } from "../use-primitive.svelte"
  import { ContainerKey } from "./context"

  type OpenDetails = ChangeDetails<TooltipOpenChangeReason>
  type PayloadDetails = ChangeDetails<TooltipPayloadChangeReason>

  let {
    open = $bindable(),
    defaultOpen,
    delay,
    closeDelay,
    disabled,
    toggleable,
    closeOnPress,
    type,
    shortcut,
    controller,
    debug,
    container,
    onOpenChange,
    onOpenChangeComplete,
    onPayloadChange,
    children,
  }: {
    /** Whether the tooltip is open. Bind it with `bind:open` to control the tooltip. */
    open?: boolean
    /** Whether the tooltip starts open, when uncontrolled. */
    defaultOpen?: boolean
    /** Milliseconds the pointer rests on the trigger before the tooltip opens. While another tooltip is open, or was a moment ago, the next one opens at once. */
    delay?: number
    /** Milliseconds before the tooltip closes once the pointer leaves the trigger and the tooltip. */
    closeDelay?: number
    /** Stops the tooltip from opening. The trigger keeps working. */
    disabled?: boolean
    /** Whether pressing the trigger opens and closes the tooltip, so touch screens can show it too. */
    toggleable?: boolean
    /** Whether pressing the trigger closes the tooltip. */
    closeOnPress?: boolean
    /** Whether the tooltip names its trigger (`"label"`) or adds a description to it (`"description"`). By default it names a trigger that has no name of its own. */
    type?: "label" | "description"
    /** The keyboard shortcut of what the trigger does, like `"mod+s"`, as a hint. A `TooltipShortcut` shows it. */
    shortcut?: string
    /** Opens, closes and inspects the tooltip from anywhere, and connects triggers outside it. Create one with `createTooltipController()`. */
    controller?: TooltipController<any>
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the popup into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the tooltip wants to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the tooltip has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the payload the content shows changes. `details.cancel()` keeps the previous one. */
    onPayloadChange?: (payload: unknown, details: PayloadDetails) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  setContext(ContainerKey, () => container)
  const tooltip = usePrimitive(tooltipPrimitive, () => ({
    id,
    get open() {
      return open
    },
    defaultOpen,
    delay,
    closeDelay,
    disabled,
    toggleable,
    closeOnPress,
    type,
    shortcut,
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
  useControllerEntry(() => controller, tooltip)
  provideInstance(tooltipPrimitive, tooltip)
</script>

{@render children?.()}
