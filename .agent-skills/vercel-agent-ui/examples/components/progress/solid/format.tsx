import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/solid/progress"
import { For } from "solid-js"

const bars = [
  {
    label: "Download",
    value: 120,
    max: 250,
    format: { style: "unit", unit: "gigabyte" },
  },
  {
    label: "Video render",
    value: 87.25,
    format: { style: "percent", maximumFractionDigits: 1 },
  },
  {
    label: "Backup",
    value: 45,
    max: 60,
    format: (minutes: number) => `${60 - minutes} min left`,
  },
  { label: "Synchronisierung", value: 40, locale: "de-DE" },
] satisfies {
  label: string
  value: number
  max?: number
  format?: Intl.NumberFormatOptions | ((value: number) => string)
  locale?: string
}[]

function Example() {
  return (
    <div data-slot="stack">
      <For each={bars}>
        {({ label, ...options }) => (
          <Progress {...options}>
            <ProgressLabel>{label}</ProgressLabel>
            <ProgressValue />
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        )}
      </For>
    </div>
  )
}

export { Example }
