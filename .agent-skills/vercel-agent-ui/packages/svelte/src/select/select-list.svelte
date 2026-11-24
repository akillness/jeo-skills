<!--
@component
The listbox, when the content holds more than items, like a `SelectInput`.
Without children, it renders the select's `items` that match.
@stable
-->
<script lang="ts">
  import {
    select as selectPrimitive,
    type SelectContentState,
  } from "@ui-sdk/core/select"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import SelectItems from "./select-items.svelte"

  let { children, ...rest }: PartProps<"div", SelectContentState> = $props()

  const select = useHandle(selectPrimitive)
  const list = useHandlePart(select, "list")
</script>

{#snippet data(state: SelectContentState)}
  {#if select.state.items}<SelectItems items={state.items} />{/if}
{/snippet}

<Part tag="div" part={list} props={{ ...rest, children: children ?? data }} />
