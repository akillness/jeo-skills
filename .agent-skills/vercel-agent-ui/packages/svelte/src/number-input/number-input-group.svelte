<!--
@component
Holds the input and its buttons.
@stable
-->
<script lang="ts">
  import type { NumberInputState } from "@ui-sdk/core/number-input"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useNumberInput } from "./context"

  let props: PartProps<"div", NumberInputState> = $props()

  const group = useHandlePart(useNumberInput("NumberInputGroup"), "group")
</script>

<Part tag="div" part={group} {props} />
