import type { UiMeterElement } from "@ui-sdk/web"
import "@ui-sdk/web/meter"

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

function mount(root: HTMLElement) {
  const items = meters.map(
    (meter) => `
      <ui-meter value="${meter.value}" ${"max" in meter ? `max="${meter.max}"` : ""} ${"locale" in meter ? `locale="${meter.locale}"` : ""}>
        <ui-meter-label>${meter.label}</ui-meter-label>
        <ui-meter-value></ui-meter-value>
        <ui-meter-track>
          <ui-meter-indicator></ui-meter-indicator>
        </ui-meter-track>
      </ui-meter>`
  )
  root.innerHTML = `<div data-slot="stack">${items.join("")}</div>`
  root
    .querySelectorAll<UiMeterElement>("ui-meter")
    .forEach((element, index) => {
      const meter = meters[index]
      if ("format" in meter) {
        element.format = meter.format
      }
    })
}

export { mount }
