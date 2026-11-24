<!--
@component
A panel of content that a button shows and hides. Put its trigger and panel inside.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    collapsible as collapsiblePrimitive,
    type CollapsibleController,
    type CollapsibleOpenChangeReason,
    type CollapsibleState,
  } from "@ui-sdk/core/collapsible"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  type Details = ChangeDetails<CollapsibleOpenChangeReason>

  let {
    open = $bindable(),
    defaultOpen,
    disabled,
    controller,
    debug,
    onOpenChange,
    onOpenChangeComplete,
    ...rest
  }: PartProps<"div", CollapsibleState> & {
    /** Whether the panel is open. Bind it with `bind:open` to control the collapsible. */
    open?: boolean
    /** Whether the panel is open at first, when uncontrolled. */
    defaultOpen?: boolean
    /** Stops the trigger from opening or closing the panel. The trigger stays focusable. */
    disabled?: boolean
    /** Opens and closes the panel from anywhere. Create one with `createCollapsibleController()`. */
    controller?: CollapsibleController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when the panel wants to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: Details) => void
    /** Runs once the panel has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
  } = $props()

  const id = $props.id()
  const collapsible = usePrimitive(collapsiblePrimitive, () => ({
    id,
    get open() {
      return open
    },
    defaultOpen,
    disabled,
    controller,
    debug,
    onOpenChange: (next: boolean, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `open` as it was.
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
  }))
  provideInstance(collapsiblePrimitive, collapsible)
  const root = useHandlePart(collapsible, "root")
</script>

<Part tag="div" part={root} props={rest} />
