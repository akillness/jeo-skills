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
import { useId } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const form = useId()

function onSubmit(event: Event) {
  const data = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(`Submitted ${data.join(", ")}`)
}
</script>

<template>
  <div data-slot="stack">
    <form :id="form" data-slot="stack" @submit.prevent="onSubmit">
      <Field>
        <Slider name="price" :default-value="[200, 800]" :max="1000" :step="10">
          <div data-slot="row">
            <FieldLabel>Price</FieldLabel>
            <SliderValue />
          </div>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
              <SliderThumb :index="0" aria-label="Minimum price" />
              <SliderThumb :index="1" aria-label="Maximum price" />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </Field>
      <Field>
        <Slider name="rating" :default-value="3" :min="1" :max="5">
          <div data-slot="row">
            <FieldLabel>Minimum rating</FieldLabel>
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
    </form>
    <Field>
      <Slider
        name="distance"
        :form="form"
        :default-value="25"
        :max="100"
        :step="5"
        :format="{ style: 'unit', unit: 'kilometer' }"
      >
        <div data-slot="row">
          <FieldLabel>Distance</FieldLabel>
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
    <div data-slot="row">
      <button type="submit" :form="form" data-variant="solid">Save</button>
      <button type="reset" :form="form">Reset</button>
    </div>
  </div>
</template>
