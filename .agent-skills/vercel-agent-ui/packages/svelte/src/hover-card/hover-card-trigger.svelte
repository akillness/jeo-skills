<!--
@component
A link by default: pressing it follows the link, and hover or focus opens the card.
@stable
-->
<script lang="ts">
  import {
    hoverCard as hoverCardPrimitive,
    type HoverCardTriggerProps,
    type HoverCardTriggerState,
  } from "@ui-sdk/core/hover-card"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import type { HoverCardContext } from "./context"
  import TriggerBinding from "./hover-card-trigger-binding.svelte"

  let {
    payload,
    controller,
    ...rest
  }: PartProps<"a", HoverCardTriggerState> & HoverCardTriggerProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<HoverCardContext | undefined>(hoverCardPrimitive)
  )
  const hoverCard = $derived(connected())
</script>

{#if hoverCard}
  <TriggerBinding owner={hoverCard} {payload} {...rest} />
{:else}
  <!-- Until the card it names mounts, a trigger outside the card is a plain link. A user
       attachment may be false or null, which `slot()` passes through the same way. -->
  <Part tag="a" part={plainPart({ open: false })} props={rest} />
{/if}
