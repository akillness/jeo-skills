<!--
@component
Shows a trigger's shortcut, like ⌘I, inside the trigger. Hidden from
screen readers, which hear aria-keyshortcuts.
@stable
-->
<script lang="ts">
  import {
    popover as popoverPrimitive,
    type PopoverShortcutProps,
    type PopoverShortcutState,
  } from "@ui-sdk/core/popover"
  import { getContext } from "svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import {
    TriggerKey,
    type PopoverContext,
    type TriggerContext,
  } from "./context"
  import ShortcutBinding from "./popover-shortcut-binding.svelte"

  let {
    shortcut,
    ...rest
  }: PartProps<"span", PopoverShortcutState> & PopoverShortcutProps = $props()

  const context = getContext<PopoverContext | undefined>(popoverPrimitive)
  const trigger = getContext<TriggerContext | undefined>(TriggerKey)
  if (!context && !trigger) {
    throw new Error("Popover parts must be used inside <Popover>.")
  }
  // A trigger outside the popover finds it through its controller only on the
  // client. Until mounted, its shortcut renders nothing, as on the server, so
  // hydration matches.
  let mounted = $state(!!context)
  $effect(() => {
    mounted = true
  })
  const popover = $derived(
    context ?? (mounted ? trigger?.popover() : undefined)
  )
</script>

<!-- Inside a trigger whose popover hasn't mounted yet, there's no shortcut to show. -->
{#if popover}
  <ShortcutBinding
    owner={popover}
    shortcut={shortcut ?? trigger?.shortcut()}
    {...rest}
  />
{/if}
