<!--
@component
The format to type, like "MM/DD/YYYY". The inputs are described by it.
@stable
-->
<script lang="ts">
  import type { DatePickerHintState } from "@ui-sdk/core/date-picker"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDatePicker } from "./context"

  let { children, ...rest }: PartProps<"span", DatePickerHintState> = $props()

  const hint = useHandlePart(useDatePicker("DatePickerHint"), "hint")
</script>

{#snippet fallback(state: DatePickerHintState)}{state.placeholder}{/snippet}

<Part
  tag="span"
  part={hint}
  props={{ ...rest, children: children ?? fallback }}
/>
