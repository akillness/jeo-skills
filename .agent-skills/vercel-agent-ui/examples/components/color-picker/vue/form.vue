<script setup lang="ts">
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
} from "@ui-sdk/vue/color-picker"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: SubmitEvent) {
  log(
    `Submitted brand=${new FormData(event.currentTarget as HTMLFormElement).get("brand")}`
  )
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <Field>
      <FieldLabel>Brand color</FieldLabel>
      <ColorPicker name="brand" default-value="#f97316">
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
</template>
