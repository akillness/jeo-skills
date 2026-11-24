<!--
@component
Shows the tooltip's shortcut, like ⌘S, formatted for the platform.
@stable
-->
<script lang="ts">
  import {
    tooltip as tooltipPrimitive,
    type TooltipShortcutProps,
    type TooltipShortcutState,
  } from "@ui-sdk/core/tooltip"
  import { getContext } from "svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import {
    TriggerKey,
    type TooltipContext,
    type TriggerContext,
  } from "./context"
  import ShortcutBinding from "./tooltip-shortcut-binding.svelte"

  let {
    shortcut,
    ...rest
  }: PartProps<"span", TooltipShortcutState> & TooltipShortcutProps = $props()

  const context = getContext<TooltipContext | undefined>(tooltipPrimitive)
  const trigger = getContext<TriggerContext | undefined>(TriggerKey)
  if (!context && !trigger) {
    throw new Error("Tooltip parts must be used inside <Tooltip>.")
  }
  // A trigger outside the tooltip finds it through its controller only on the
  // client. Until mounted, its shortcut renders nothing, as on the server, so
  // hydration matches.
  let mounted = $state(!!context)
  $effect(() => {
    mounted = true
  })
  const tooltip = $derived(context ?? (mounted ? trigger?.() : undefined))
</script>

<!-- Inside a trigger whose tooltip hasn't mounted yet, there's no shortcut to show. -->
{#if tooltip}
  <ShortcutBinding owner={tooltip} {shortcut} {...rest} />
{/if}
