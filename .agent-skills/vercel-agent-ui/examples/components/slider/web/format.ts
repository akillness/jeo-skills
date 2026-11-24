import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

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

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      ${sliders
        .map(
          (slider) => `
            <ui-field>
              <ui-slider
                default-value="${slider.defaultValue}"
                max="${slider.max}"
                step="${slider.step}"${"locale" in slider ? ` locale="${slider.locale}"` : ""}
              >
                <div data-slot="row">
                  <ui-field-label>${slider.label}</ui-field-label>
                  <ui-slider-value></ui-slider-value>
                </div>
                <ui-slider-control>
                  <ui-slider-track>
                    <ui-slider-indicator></ui-slider-indicator>
                    <ui-slider-thumb></ui-slider-thumb>
                  </ui-slider-track>
                </ui-slider-control>
              </ui-slider>
            </ui-field>
          `
        )
        .join("")}
    </div>
  `
  root.querySelectorAll("ui-slider").forEach((slider, index) => {
    slider.format = sliders[index].format
  })
}

export { mount }
