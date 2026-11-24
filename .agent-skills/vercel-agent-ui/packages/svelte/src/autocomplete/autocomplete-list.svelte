<!--
@component
The listbox. Without children, it renders the autocomplete's `items`, filtered.
@stable
-->
<script lang="ts">
  import {
    autocomplete as autocompletePrimitive,
    type AutocompleteContentState,
  } from "@ui-sdk/core/autocomplete"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import AutocompleteItems from "./autocomplete-items.svelte"

  let { children, ...rest }: PartProps<"div", AutocompleteContentState> =
    $props()

  const autocomplete = useHandle(autocompletePrimitive)
  const list = useHandlePart(autocomplete, "list")
</script>

{#snippet data(state: AutocompleteContentState)}
  {#if autocomplete.state.items}<AutocompleteItems items={state.items} />{/if}
{/snippet}

<Part tag="div" part={list} props={{ ...rest, children: children ?? data }} />
