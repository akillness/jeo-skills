<!--
@component
An option that selects every item that matches, with `multiple`: in its
group inside a `SelectGroup`, or in the whole list.
@stable
-->
<script lang="ts">
  import { selectAllKey, selectSelectAll } from "@ui-sdk/core/renderer"
  import {
    select as selectPrimitive,
    type SelectSelectAllState,
  } from "@ui-sdk/core/select"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div", SelectSelectAllState> = $props()

  const select = useHandle(selectPrimitive)
  select.instance.use(selectSelectAll)
  const id = selectAllKey(getContext<string | undefined>(GroupKey))
  const part = useHandlePart(select, "select-all", () => ({ id }))
</script>

{#if part.present}
  <Part tag="div" {part} {props} />
{/if}
