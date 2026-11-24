<!--
@component
Selects the value it holds, like the last 7 days.
@stable
-->
<script lang="ts">
  import type {
    DatePickerPresetState,
    DatePickerValue,
  } from "@ui-sdk/core/date-picker"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDatePicker } from "./context"

  let {
    value,
    ...rest
  }: PartProps<"button", DatePickerPresetState, "value"> & {
    /** The value it selects: an ISO date, or `[start, end]` in range mode. */
    value: DatePickerValue
  } = $props()

  const preset = useHandlePart(
    useDatePicker("DatePickerPreset"),
    "preset",
    () => ({
      value,
      id: JSON.stringify(value),
    })
  )
</script>

<Part tag="button" part={preset} props={rest} />
