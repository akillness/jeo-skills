<!--
@component
A text input that reads a date typed in the page's language on Enter or
blur. `end` makes it a range's end. The core writes its text.
@stable
-->
<script lang="ts">
  import type {
    DatePickerInputProps,
    DatePickerInputState,
  } from "@ui-sdk/core/date-picker"
  import { untrack } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, wrapPart } from "../use-primitive.svelte"
  import type { TextPartProps } from "../text-control"
  import { useDatePicker } from "./context"

  let {
    end = false,
    ...rest
  }: TextPartProps<"input", DatePickerInputState> & DatePickerInputProps =
    $props()

  const picker = useDatePicker("DatePickerInput")
  const input = useHandlePart(picker, "input", () => ({
    end,
    id: end ? "end" : "start",
  }))
  // Field names the first input, and its description follows the input's own and the format hint's. Which input it is stays as it mounted.
  const field = untrack(() => end)
    ? undefined
    : picker.field?.control(
        () => rest.id as string | undefined,
        () =>
          [rest["aria-describedby"], input.attrs["aria-describedby"]]
            .filter(Boolean)
            .join(" ") || undefined
      )
</script>

<Part tag="input" part={wrapPart(input, field)} props={rest} />
