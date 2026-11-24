// Progress and Meter show a number between bounds as a bar. This module holds
// where the value sits, how it reads, and the attributes and inline styles of
// their track, indicator, label and value parts. Pure, so it runs on the server.
import { css } from "../kernel/inline-style"
import { localeOf } from "../text/locale"
import { formatNumber, type NumberFormat } from "../../foundation/number/format"
import { clamp } from "../../foundation/number/steps"

/**
 * What `getValueLabel` receives after the value. `Value` is `number` for a
 * meter, which always has one, and `number | null` for a progress bar.
 * @stable
 */
type GaugeLabelDetails<Value extends number | null = number | null> = {
  /** The value as `format` and `locale` show it. Empty while there is no value. */
  formatted: string
  /** Where the value sits between `min` and `max`, from 0 to 100. Null while there is no value. */
  percent: number | Extract<Value, null>
  /** The lowest value. */
  min: number
  /** The highest value. */
  max: number
}

/** The options Progress and Meter share. `Value` is the type of the value they show. */
type GaugeOptions<Value extends number | null = number | null> = {
  /**
   * The lowest value.
   * @defaultValue 0
   */
  min?: number
  /**
   * The highest value.
   * @defaultValue 100
   */
  max?: number
  /**
   * How the value reads, for screen readers and the Value part:
   * `Intl.NumberFormat` options, or a function of the value. A percent style
   * shows where the value sits between `min` and `max`; any other style shows
   * the value itself, like `{ style: "unit", unit: "gigabyte" }`.
   * @defaultValue { style: "percent" }
   */
  format?: NumberFormat
  /**
   * The locale the value is formatted in. Defaults to the page's `lang`, or
   * the browser's language without one, once the page is interactive. Server
   * markup uses English until then, so it never disagrees with the client.
   */
  locale?: string
  /**
   * The text screen readers announce for the value, when the formatted value
   * says too little, like "3 of 12 files". It receives the value, null while
   * a progress bar is indeterminate, and details: the `formatted` value, its
   * `percent`, `min` and `max`.
   */
  getValueLabel?: (value: Value, details: GaugeLabelDetails<Value>) => string
}

// The settings parts render from, kept in state so a change re-renders them.
type GaugeSettings = {
  min: number
  max: number
  format: NumberFormat | undefined
  locale: string | undefined
  getValueLabel: GaugeOptions["getValueLabel"]
  // The page's language, read once the root binds. Null on the server and
  // until then, so the first render matches the server's.
  pageLocale?: string | null
}

// A maximum below the minimum is the minimum.
function gaugeSettings(options: GaugeOptions) {
  const min = finite(options.min, 0)
  return {
    min,
    max: Math.max(min, finite(options.max, 100)),
    format: options.format,
    locale: options.locale,
    getValueLabel: options.getValueLabel,
  }
}

function finite(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

/** Where a value sits between the bounds, from 0 to 100, clamped. */
function percentBetween(value: number, min: number, max: number) {
  if (max <= min) {
    return value >= max ? 100 : 0
  }
  return ((clamp(value, min, max) - min) / (max - min)) * 100
}

// A percent style formats the share of the range, so 30 of 0 to 60 reads 50%.
// Any other style formats the value as it is.
function formatGaugeValue(value: number | null, settings: GaugeSettings) {
  if (value === null) {
    return ""
  }
  const { format, min, max } = settings
  const locale = localeOf(settings)
  if (typeof format === "function") {
    return format(value)
  }
  if (format && format.style !== "percent") {
    return formatNumber(value, locale, format)
  }
  return formatNumber(
    percentBetween(value, min, max) / 100,
    locale,
    format ?? { style: "percent" }
  )
}

// What screen readers announce: the custom label, or the formatted value.
function gaugeValueText(value: number | null, settings: GaugeSettings) {
  const formatted = formatGaugeValue(value, settings)
  if (!settings.getValueLabel) {
    return formatted || undefined
  }
  const percent =
    value === null ? null : percentBetween(value, settings.min, settings.max)
  return settings.getValueLabel(value, {
    formatted,
    percent,
    min: settings.min,
    max: settings.max,
  })
}

// The range attributes of the root, which carries the role. A value of null
// leaves `aria-valuenow` out, which is how a busy, indeterminate bar reads.
function gaugeAria(value: number | null, settings: GaugeSettings) {
  return {
    "aria-valuemin": String(settings.min),
    "aria-valuemax": String(settings.max),
    "aria-valuenow":
      value === null
        ? undefined
        : String(clamp(value, settings.min, settings.max)),
    "aria-valuetext": gaugeValueText(value, settings),
  }
}

// The indicator fills the track from its start, so it needs only a width.
// Right to left, `inset-inline-start` starts from the right by itself.
function indicatorStyle(percent: number | null) {
  return percent === null
    ? undefined
    : css({ "inset-inline-start": 0, width: `${roundPercent(percent)}%` })
}

function roundPercent(percent: number) {
  return Math.round(percent * 1e4) / 1e4
}

// The id a Label part takes, which the root's `aria-labelledby` points at.
const labelId = (id: string) => `${id}-label`

// Until the root binds, like on a server, it points at a label wherever one
// renders, so the server's HTML names it. Binding keeps it only with a label.
const labelledBy = (state: { labels: number; bound: boolean }, id: string) =>
  state.labels || !state.bound ? labelId(id) : undefined

// What Progress and Meter set up: Label parts name the root while any is on the page.
function gaugeApi(store: {
  get: () => { labels: number }
  set: (patch: { labels: number }) => void
}) {
  return {
    internal: {
      label: () => {
        store.set({ labels: store.get().labels + 1 })
        let bound = true
        return () => {
          if (!bound) {
            return
          }
          bound = false
          store.set({ labels: store.get().labels - 1 })
        }
      },
    },
  }
}

export {
  finite,
  formatGaugeValue,
  gaugeAria,
  type GaugeLabelDetails,
  type GaugeOptions,
  gaugeSettings,
  type GaugeSettings,
  gaugeApi,
  indicatorStyle,
  labelId,
  labelledBy,
  percentBetween,
  roundPercent,
}
export type { NumberFormat } from "../number/format"
