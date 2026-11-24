<!--
@component
Shown while no item matches. Rendering it keeps the menu open with no matches.
@stable
-->
<script lang="ts">
  import {
    triggerMenu,
    type TriggerMenuEmptyState,
  } from "@ui-sdk/core/trigger-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"div", TriggerMenuEmptyState> = $props()

  const empty = usePart(triggerMenu, "empty")
</script>

{#snippet whenEmpty(state: TriggerMenuEmptyState)}
  {#if state.empty}{@render children?.(state)}{/if}
{/snippet}

<Part tag="div" part={empty} props={{ ...rest, children: whenEmpty }} />
