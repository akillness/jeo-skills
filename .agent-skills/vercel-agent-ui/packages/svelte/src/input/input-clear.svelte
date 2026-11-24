<!--
@component
Empties the field in its group and focuses it. Shown while there's text to clear.
@stable
-->
<script lang="ts">
  import type { InputGroupState } from "@ui-sdk/core/input"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useInputGroup } from "./context"

  let props: PartProps<"button", InputGroupState> = $props()

  const clear = useHandlePart(useInputGroup("InputClear"), "clear")
</script>

{#if clear.present}
  <Part tag="button" part={clear} {props} />
{/if}
