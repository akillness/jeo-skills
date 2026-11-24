<script lang="ts">
  import { Checkbox } from "../../src/checkbox"
  import {
    DatePicker,
    DatePickerHint,
    DatePickerInput,
  } from "../../src/date-picker"
  import { Field, FieldControl, FieldDescription } from "../../src/field"
  import { Input } from "../../src/input"
  import { Slider, SliderControl, SliderThumb } from "../../src/slider"
  import { Textarea } from "../../src/textarea"

  let {
    control,
  }: {
    control:
      | "field-control"
      | "input"
      | "textarea"
      | "checkbox"
      | "slider"
      | "date-picker"
  } = $props()
</script>

<Field>
  {#if control === "field-control"}
    <FieldControl aria-describedby="hint" />
  {:else if control === "input"}
    <Input aria-describedby="hint" />
  {:else if control === "textarea"}
    <Textarea aria-describedby="hint" />
  {:else if control === "slider"}
    <Slider defaultValue={[5]}>
      <SliderControl><SliderThumb aria-describedby="hint" /></SliderControl>
    </Slider>
  {:else if control === "date-picker"}
    <DatePicker>
      <DatePickerInput aria-describedby="hint" />
      <DatePickerHint />
    </DatePicker>
  {:else}
    <Checkbox aria-describedby="hint" />
  {/if}
  <FieldDescription>We never share it.</FieldDescription>
</Field>
