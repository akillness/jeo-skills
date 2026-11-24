<!--
@component
The listbox. Without children, it renders the combobox's `items`, filtered.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxContentState,
  } from "@ui-sdk/core/combobox"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import ComboboxItems from "./combobox-items.svelte"

  let { children, ...rest }: PartProps<"div", ComboboxContentState> = $props()

  const combobox = useHandle(comboboxPrimitive)
  const list = useHandlePart(combobox, "list")
</script>

{#snippet data(state: ComboboxContentState)}
  {#if combobox.state.items}<ComboboxItems items={state.items} />{/if}
{/snippet}

<Part tag="div" part={list} props={{ ...rest, children: children ?? data }} />
