import "@ui-sdk/web/progress"

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

function mount(root: HTMLElement) {
  const items = bars.map(
    (bar) => `
      <ui-progress value="${bar.value}" ${"max" in bar ? `max="${bar.max}"` : ""} ${"locale" in bar ? `locale="${bar.locale}"` : ""}>
        <ui-progress-label>${bar.label}</ui-progress-label>
        <ui-progress-value></ui-progress-value>
        <ui-progress-track>
          <ui-progress-indicator></ui-progress-indicator>
        </ui-progress-track>
      </ui-progress>`
  )
  root.innerHTML = `<div data-slot="stack">${items.join("")}</div>`
  root
    .querySelectorAll<HTMLElement & { format?: unknown }>("ui-progress")
    .forEach((progress, index) => {
      const bar = bars[index]
      if ("format" in bar) {
        progress.format = bar.format
      }
    })
}

export { mount }
