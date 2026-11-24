<script lang="ts">
  import {
    ColorPicker,
    ColorPickerArea,
    ColorPickerAreaThumb,
    ColorPickerSlider,
    ColorPickerSliderThumb,
    ColorPickerSwatch,
  } from "@ui-sdk/svelte/color-picker"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    log(`Submitted brand=${new FormData(event.currentTarget).get("brand")}`)
  }
</script>

<form data-slot="stack" {onsubmit}>
  <Field>
    <FieldLabel>Brand color</FieldLabel>
    <ColorPicker name="brand" defaultValue="#f97316">
      <ColorPickerArea>
        <ColorPickerAreaThumb />
      </ColorPickerArea>
      <div data-slot="row">
        <ColorPickerSwatch />
        <ColorPickerSlider channel="hue">
          <ColorPickerSliderThumb />
        </ColorPickerSlider>
      </div>
    </ColorPicker>
  </Field>
  <div data-slot="row">
    <button type="submit" data-variant="solid">Save</button>
    <button type="reset">Reset</button>
  </div>
</form>
