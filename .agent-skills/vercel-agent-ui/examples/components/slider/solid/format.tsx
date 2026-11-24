import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/solid/slider"
import { For } from "solid-js"

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

function Example() {
  return (
    <div data-slot="stack">
      <For each={sliders}>
        {({ label, ...options }) => (
          <Field>
            <Slider {...options}>
              <div data-slot="row">
                <FieldLabel>{label}</FieldLabel>
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
        )}
      </For>
    </div>
  )
}

export { Example }
