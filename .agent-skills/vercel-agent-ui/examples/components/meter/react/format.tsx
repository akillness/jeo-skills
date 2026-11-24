import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/react/meter"

const meters = [
  {
    label: "Storage",
    value: 120,
    max: 250,
    format: { style: "unit", unit: "gigabyte" },
  },
  {
    label: "Budget",
    value: 1840,
    max: 2500,
    format: { style: "currency", currency: "USD", maximumFractionDigits: 0 },
  },
  {
    label: "Seats",
    value: 18,
    max: 25,
    format: (seats: number) => `${seats} of 25 seats`,
  },
  { label: "Auslastung", value: 40, locale: "de-DE" },
] satisfies {
  label: string
  value: number
  max?: number
  format?: Intl.NumberFormatOptions | ((value: number) => string)
  locale?: string
}[]

export function Example() {
  return (
    <div data-slot="stack">
      {meters.map(({ label, ...options }) => (
        <Meter key={label} {...options}>
          <MeterLabel>{label}</MeterLabel>
          <MeterValue />
          <MeterTrack>
            <MeterIndicator />
          </MeterTrack>
        </Meter>
      ))}
    </div>
  )
}
