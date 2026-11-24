<!--
@component
An option that selects every item that matches, with `multiple`: in its
group inside a `ComboboxGroup`, or in the whole list.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxSelectAllState,
  } from "@ui-sdk/core/combobox"
  import { comboboxSelectAll, selectAllKey } from "@ui-sdk/core/renderer"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div", ComboboxSelectAllState> = $props()

  const combobox = useHandle(comboboxPrimitive)
  combobox.instance.use(comboboxSelectAll)
  const id = selectAllKey(getContext<string | undefined>(GroupKey))
  const part = useHandlePart(combobox, "select-all", () => ({ id }))
</script>

{#if part.present}
  <Part tag="div" {part} {props} />
{/if}
