<!--
@component
Shown while no item matches the search. Its message is announced when it appears.
@stable
-->
<script lang="ts">
  import { select, type SelectEmptyState } from "@ui-sdk/core/select"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"div", SelectEmptyState> = $props()

  const empty = usePart(select, "empty")
</script>

{#snippet whenEmpty(state: SelectEmptyState)}
  {#if state.empty}{@render children?.(state)}{/if}
{/snippet}

<Part tag="div" part={empty} props={{ ...rest, children: whenEmpty }} />
