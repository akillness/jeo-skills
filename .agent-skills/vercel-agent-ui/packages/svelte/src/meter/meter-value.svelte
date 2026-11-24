<!--
@component
The formatted value, like "40%". Content replaces it.
@stable
-->
<script lang="ts">
  import { meter, type MeterValueState } from "@ui-sdk/core/meter"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let { children, ...rest }: PartProps<"span", MeterValueState> = $props()

  const value = usePart(meter, "value")
</script>

{#snippet text(state: MeterValueState)}{state.text}{/snippet}

<Part tag="span" part={value} props={{ ...rest, children: children ?? text }} />
