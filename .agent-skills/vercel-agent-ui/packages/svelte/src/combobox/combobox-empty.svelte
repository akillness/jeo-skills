<!--
@component
Shown while no item matches. Its message is announced when it appears.
@stable
-->
<script lang="ts">
  import { combobox, type ComboboxEmptyState } from "@ui-sdk/core/combobox"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"div", ComboboxEmptyState> = $props()

  const empty = usePart(combobox, "empty")
</script>

{#snippet whenEmpty(state: ComboboxEmptyState)}
  {#if state.empty}{@render children?.(state)}{/if}
{/snippet}

<Part tag="div" part={empty} props={{ ...rest, children: whenEmpty }} />
