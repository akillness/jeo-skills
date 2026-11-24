<!--
@component
Shown while no suggestion matches. Its message is announced when it appears.
@stable
-->
<script lang="ts">
  import {
    autocomplete,
    type AutocompleteEmptyState,
  } from "@ui-sdk/core/autocomplete"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"div", AutocompleteEmptyState> = $props()

  const empty = usePart(autocomplete, "empty")
</script>

{#snippet whenEmpty(state: AutocompleteEmptyState)}
  {#if state.empty}{@render children?.(state)}{/if}
{/snippet}

<Part tag="div" part={empty} props={{ ...rest, children: whenEmpty }} />
