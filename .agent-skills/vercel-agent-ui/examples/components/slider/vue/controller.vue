<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  createSliderController,
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/vue/slider"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const volume = createSliderController<number>()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="volume.setValue(0)">Mute</button>
      <button type="button" @click="volume.setValue(volume.getValue() + 10)">
        Louder
      </button>
      <button type="button" @click="log(`Volume is ${volume.getValue()}`)">
        Read
      </button>
      <button type="button" @click="volume.focus()">Focus</button>
    </div>
    <Field>
      <Slider
        :default-value="40"
        :controller="volume"
        @value-change="
          (value, details) => log(`Volume ${value} (${details.reason})`)
        "
      >
        <div data-slot="row">
          <FieldLabel>Volume</FieldLabel>
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
  </div>
</template>
