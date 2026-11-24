<!--
@component
A button that selects nothing. Shown while something is selected, or always with `keepMounted`.
@stable
-->
<script lang="ts">
  import {
    select,
    type SelectClearProps,
    type SelectClearState,
  } from "@ui-sdk/core/select"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    keepMounted,
    ...rest
  }: PartProps<"button", SelectClearState> & SelectClearProps = $props()

  const clear = usePart(select, "clear", () => ({ keepMounted }))
</script>

{#if clear.present}
  <Part tag="button" part={clear} props={rest} />
{/if}
