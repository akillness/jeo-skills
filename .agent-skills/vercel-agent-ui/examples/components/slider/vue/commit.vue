<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/vue/slider"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Field>
    <Slider
      @value-commit="
        (value, details) => log(`Saved ${value} (${details.reason})`)
      "
      :default-value="50"
    >
      <div data-slot="row">
        <FieldLabel>Brightness</FieldLabel>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb />
        </SliderTrack>
      </SliderControl>
    </Slider>
  </Field>
</template>
