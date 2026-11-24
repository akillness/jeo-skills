<!--
@component
The text field, which shows the formatted number and takes typing.
@stable
-->
<script lang="ts">
  import type { NumberInputState } from "@ui-sdk/core/number-input"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import { useNumberInput } from "./context"

  let props: PartProps<"input", NumberInputState> = $props()

  const numberInput = useNumberInput("NumberInputControl")
  const control = useHandlePart(numberInput, "control")
  const field = numberInput.field?.control(
    () => props.id,
    () => props["aria-describedby"]
  )
</script>

<Part tag="input" part={wrapPart(control, field)} {props} />
