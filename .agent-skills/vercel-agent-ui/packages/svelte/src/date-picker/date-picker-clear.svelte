<!--
@component
Clears the value and focuses the input.
@stable
-->
<script lang="ts">
  import type { DatePickerClearState } from "@ui-sdk/core/date-picker"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDatePicker } from "./context"

  let props: PartProps<"button", DatePickerClearState> = $props()

  const clear = useHandlePart(useDatePicker("DatePickerClear"), "clear")
</script>

<Part tag="button" part={clear} {props} />
