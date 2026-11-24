<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Slider,
    SliderControl,
    SliderIndicator,
    SliderThumb,
    SliderTrack,
    SliderValue,
  } from "@ui-sdk/svelte/slider"

  const sliders = [
    {
      label: "Budget",
      defaultValue: 40,
      max: 100,
      step: 1,
      format: { style: "currency", currency: "USD", maximumFractionDigits: 0 },
    },
    {
      label: "Opacity",
      defaultValue: 0.6,
      max: 1,
      step: 0.01,
      format: { style: "percent" },
    },
    {
      label: "Weight",
      defaultValue: 20,
      max: 50,
      step: 0.5,
      format: { style: "unit", unit: "kilogram" },
    },
    {
      label: "Duration",
      defaultValue: 90,
      max: 600,
      step: 15,
      format: (seconds: number) =>
        `${Math.floor(seconds / 60)} min ${seconds % 60} s`,
    },
    {
      label: "Preis",
      defaultValue: 40,
      max: 100,
      step: 1,
      format: { style: "currency", currency: "EUR" },
      locale: "de-DE",
    },
  ] satisfies {
    label: string
    defaultValue: number
    max: number
    step: number
    format: Intl.NumberFormatOptions | ((value: number) => string)
    locale?: string
  }[]
</script>

<div data-slot="stack">
  {#each sliders as slider (slider.label)}
    <Field>
      <Slider
        defaultValue={slider.defaultValue}
        max={slider.max}
        step={slider.step}
        format={slider.format}
        locale={"locale" in slider ? slider.locale : undefined}
      >
        <div data-slot="row">
          <FieldLabel>{slider.label}</FieldLabel>
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
  {/each}
</div>
