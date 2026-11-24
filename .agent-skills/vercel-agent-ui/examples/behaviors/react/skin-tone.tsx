import * as React from "react"
import { createLocalStorage, createPreference } from "@ui-sdk/core"
import { Preferences, usePreference } from "@ui-sdk/react/preferences"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"

const tones = [
  { value: "default", label: "Default", wave: "👋" },
  { value: "light", label: "Light", wave: "👋🏻" },
  { value: "medium-light", label: "Medium light", wave: "👋🏼" },
  { value: "medium", label: "Medium", wave: "👋🏽" },
  { value: "medium-dark", label: "Medium dark", wave: "👋🏾" },
  { value: "dark", label: "Dark", wave: "👋🏿" },
] as const

const skinTone = createPreference({
  values: tones.map((tone) => tone.value),
  defaultValue: "default",
  attribute: "data-skin-tone",
  storage: createLocalStorage("ui-sdk-skin-tone"),
})

function Wave() {
  return (
    <span role="img" aria-label="Waving hand" data-slot="skin-tone-wave">
      {tones.map((tone) => (
        <span key={tone.value} aria-hidden="true" data-show={tone.value}>
          {tone.wave}
        </span>
      ))}
    </span>
  )
}

function TonePicker() {
  const { value } = usePreference(skinTone)
  return (
    <RadioGroup
      aria-label="Preferred default emoji skin tone"
      value={value}
      onValueChange={(next, details) => {
        if (next) {
          skinTone.set(next, { reason: "item-press", event: details.event })
        }
      }}
    >
      {tones.map((tone) => (
        <label key={tone.value} data-slot="label">
          <Radio value={tone.value} aria-label={tone.label}>
            <RadioIndicator />
          </Radio>
          <span aria-hidden="true">{tone.wave}</span>
        </label>
      ))}
    </RadioGroup>
  )
}

function Example() {
  return (
    <Preferences preferences={[skinTone]}>
      <div data-slot="skin-tone-card">
        <div data-slot="row">
          <Wave />
          <div data-slot="stack">
            <span data-slot="label">Welcome back</span>
            <span data-slot="hint">
              Emoji in your messages use your skin tone.
            </span>
          </div>
        </div>
        <div data-slot="stack">
          <span data-slot="label">Preferred default emoji skin tone</span>
          <TonePicker />
        </div>
      </div>
    </Preferences>
  )
}

export { Example, skinTone }
