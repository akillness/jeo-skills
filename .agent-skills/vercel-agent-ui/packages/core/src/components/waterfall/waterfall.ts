import { dev } from "#dev"
import { checkName } from "#name-check"
import { idPart } from "../../foundation/kernel/attrs"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { css } from "../../foundation/kernel/inline-style"
import { direct } from "../../foundation/kernel/live"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { selects } from "../../foundation/kernel/selects"
import type { ListHighlightDetails } from "../../foundation/lists/listbox"
import type { NumberFormat } from "../../foundation/number/format"
import { bindPageLocale } from "../../foundation/text/locale"
import {
  waterfallApi,
  type WaterfallApi,
  type WaterfallStore,
} from "./waterfall-api"
import type { WaterfallTickData } from "./waterfall-time"

/**
 * One span of a trace: a request, a function call or any step with a start
 * and a duration, and the spans it started.
 * @experimental
 */
type WaterfallDataItem = {
  /** Identifies the span. Unique in the waterfall. */
  value: string
  /** What its row shows, and what typeahead matches. */
  label: string
  /** When it starts, in milliseconds, on the same clock as every other span. */
  start: number
  /** How long it lasts, in milliseconds. */
  duration: number
  /** The spans it started. Leave it out for a span with none. */
  children?: WaterfallDataItem[]
}

/**
 * The spans of a trace, as `items` takes them.
 * @experimental
 */
type WaterfallData = WaterfallDataItem[]

/**
 * One row that shows when only the expanded spans are open, for a waterfall
 * that renders only the rows in view.
 * @experimental
 */
type WaterfallDataRow = {
  /** The span this row shows, the same object you passed in. */
  item: WaterfallDataItem
  /** The value of the span it's nested in, or `null` at the top level. */
  parent: string | null
  /** Its depth, 1 at the top level. */
  level: number
  /** Its place among the rows that show, from 0. */
  index: number
}

/**
 * Why spans expanded or collapsed: an indicator was clicked, an arrow key
 * opened or closed it, or a controller changed it.
 * @experimental
 */
type WaterfallExpandedChangeReason =
  "trigger-press" | "list-navigation" | "imperative"

/**
 * Why the selected span changed: a row was clicked, Enter or Space was
 * pressed on it, or a controller changed it.
 * @experimental
 */
type WaterfallValueChangeReason = "item-press" | "imperative"

/**
 * What `getBarLabel` receives besides the span: its start and duration as
 * `format` and the locale show them.
 * @experimental
 */
type WaterfallBarLabelDetails = {
  /** When the span starts, formatted, like "120 ms". */
  start: string
  /** How long it lasts, formatted, like "340 ms". */
  duration: string
}

/**
 * Options for every write method on a controller.
 * @experimental
 */
type WaterfallChangeOptions<Reason extends string = string> =
  ChangeOptions<Reason>

/**
 * Drives a waterfall from outside it: "Expand all" and "Collapse all"
 * buttons, a link to a span, or a test. Pass it as the `controller` option.
 * @experimental
 */
function createWaterfallController() {
  return createController<{
    /** The selected span's value, or `null`. */
    getValue: () => string | null
    /** Selects a span, or nothing with `null`. Returns false when canceled. */
    setValue: (
      value: string | null,
      options?: WaterfallChangeOptions<WaterfallValueChangeReason>
    ) => boolean
    /** The values of the expanded spans. */
    getExpanded: () => string[]
    /** Expands exactly these spans. Returns false when canceled. */
    setExpanded: (
      expanded: string[],
      options?: WaterfallChangeOptions<WaterfallExpandedChangeReason>
    ) => boolean
    /** Whether a span is expanded. */
    isExpanded: (value: string) => boolean
    /** Expands a span. */
    expand: (
      value: string,
      options?: WaterfallChangeOptions<WaterfallExpandedChangeReason>
    ) => boolean
    /** Collapses a span. Focus inside it moves to its row. */
    collapse: (
      value: string,
      options?: WaterfallChangeOptions<WaterfallExpandedChangeReason>
    ) => boolean
    /** Expands a collapsed span, or collapses an expanded one. */
    toggle: (
      value: string,
      options?: WaterfallChangeOptions<WaterfallExpandedChangeReason>
    ) => boolean
    /** Expands every span with children. */
    expandAll: (
      options?: WaterfallChangeOptions<WaterfallExpandedChangeReason>
    ) => boolean
    /** Collapses every span. */
    collapseAll: (
      options?: WaterfallChangeOptions<WaterfallExpandedChangeReason>
    ) => boolean
    /** Expands a span's ancestors and focuses its row, through `onHighlight` when it isn't rendered. */
    reveal: (value: string) => void
    /** Focuses a span's row, or the row with the tab stop. */
    focus: (value?: string) => void
  }>()
}

/**
 * A controller from `createWaterfallController()`. Pass it as the `controller` option.
 * @experimental
 */
type WaterfallController = ReturnType<typeof createWaterfallController>

/**
 * The options `waterfall` takes. A component takes them as props on its root.
 * @experimental
 */
type WaterfallOptions = {
  /** The spans, each with a `value`, a `label`, a `start`, a `duration` and the spans it started as `children`. */
  items: WaterfallData
  /**
   * The stretch of time the axis shows, as `[start, end]` in milliseconds.
   * Bars outside it shrink to its edges. Change it to zoom or pan.
   * @defaultValue From the earliest start to the latest end
   */
  range?: [number, number]
  /** The selected span's value. Pass it to control the selection. `null` selects nothing. */
  value?: string | null
  /** The span selected at first, when uncontrolled. */
  defaultValue?: string | null
  /** Runs when the selection wants to change. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: string | null,
    details: ChangeDetails<WaterfallValueChangeReason>
  ) => void
  /** The expanded spans' values. Pass it to control which spans show their children. */
  expanded?: string[]
  /** The spans expanded at first, when uncontrolled. */
  defaultExpanded?: string[]
  /** Runs when spans want to expand or collapse. `details.reason` says why, and `details.cancel()` stops it. */
  onExpandedChange?: (
    expanded: string[],
    details: ChangeDetails<WaterfallExpandedChangeReason>
  ) => void
  /**
   * Runs when the keyboard moves focus to a row, with its place among the
   * rows that show, from 0. A waterfall that renders only the rows in view
   * scrolls that row into view here, so it can take focus once it renders.
   */
  onHighlight?: (value: string, details: ListHighlightDetails) => void
  /**
   * How times read on the axis and to screen readers: `Intl.NumberFormat`
   * options for a number of milliseconds, or a function of it.
   * @defaultValue Milliseconds, seconds or minutes, whichever reads best
   */
  format?: NumberFormat
  /**
   * The locale times are formatted in. Defaults to the page's `lang`, or the
   * browser's language without one, once the page is interactive. Server
   * markup uses English until then, so it never disagrees with the client.
   */
  locale?: string
  /**
   * What screen readers hear for a span's bar. Set it in the page's language.
   * @defaultValue "Starts at 120 ms, lasts 340 ms"
   */
  getBarLabel?: (
    item: WaterfallDataItem,
    details: WaterfallBarLabelDetails
  ) => string
  /** Drives the waterfall from anywhere. Create one with `createWaterfallController()`. */
  controller?: WaterfallController
} & PrimitiveOptions

/**
 * The props the `row` slot of `waterfall` takes.
 * @experimental
 */
type WaterfallRowProps = {
  /** The value of the span the row shows. */
  value: string
}

type RowPartProps = {
  /** @internal The value of the row the part is in. Parts read it from the row. */
  value?: string
}

/**
 * The props the `row-header`, `indicator`, `cell` and `bar` slots of
 * `waterfall` take. They read their span from the row around them.
 * @experimental
 */
type WaterfallRowPartProps = Omit<RowPartProps, "value">

/**
 * The props the `axis` slot of `waterfall` takes.
 * @experimental
 */
type WaterfallAxisProps = {
  /**
   * The most ticks the axis shows. Ticks fall on round times, so it may show fewer.
   * @defaultValue 6
   */
  maxTicks?: number
}

/**
 * The props the `tick` and `mark` slots of `waterfall` take.
 * @experimental
 */
type WaterfallTimeProps = {
  /** The moment it marks, in milliseconds. */
  time: number
}

/**
 * What the root's `render` functions and state-based class names receive.
 * @experimental
 */
type WaterfallState = {
  /** The stretch of time the axis shows, as `[start, end]` in milliseconds. */
  range: [number, number]
}

/**
 * What a row's `render` functions and state-based class names receive. Its
 * header, indicator, cells and bar get the same.
 * @experimental
 */
type WaterfallRowState = {
  /** Whether it's a span with children that's expanded. */
  expanded: boolean
  /** Whether it's the selected span. */
  selected: boolean
  /** Whether its span has children. */
  branch: boolean
  /** Its depth, 1 at the top level. */
  level: number
}

/**
 * What the axis's `render` functions and state-based class names receive.
 * @experimental
 */
type WaterfallAxisState = {
  /** The ticks it shows, at round times inside the range. */
  ticks: WaterfallTickData[]
}

/**
 * What a tick's or a mark's `render` functions and state-based class names receive.
 * @experimental
 */
type WaterfallTimeState = {
  /** The moment it marks, in milliseconds. */
  time: number
  /** The time as `format` and the locale show it. */
  label: string
  /** Where it sits between the range's start and end, from 0 to 100. */
  position: number
  /** Whether its time is outside the range, so it doesn't show on the axis. */
  outside: boolean
}

const flag = (on: boolean) => (on ? "" : undefined)

// The value of the row a part is in. Every renderer fills it from the row
// around the part, so it's set by the time the part reads it.
const rowOf = (props: RowPartProps) => props.value!

function rowState(
  state: WaterfallStore,
  key: string,
  api: WaterfallApi
): WaterfallRowState {
  const branch = api.internal.isBranch(key)
  return {
    expanded: branch && state.expanded.includes(key),
    selected: state.value === key,
    branch,
    level: api.internal.level(key),
  }
}

function rowDataAttrs(row: WaterfallRowState) {
  return {
    "data-level": String(row.level),
    "data-branch": flag(row.branch),
    "data-expanded": flag(row.expanded),
    "data-selected": flag(row.selected),
  }
}

// A row's own state changes reach it alone: an arrow key reaches the two rows
// it moves between, and a selection the two rows it moves between.
const byRow = ({ props }: { props: RowPartProps }) => [rowOf(props)]
const rowPartReads = {
  value: byRow,
  expanded: byRow,
  active: [],
  cell: [],
}

// Parts outside the rows read none of the rows' own state.
const noRowReads = { value: [], expanded: [], active: [], cell: [] }

const waterfallPrimitive = /* @__PURE__ */ definePrimitive({
  name: "waterfall",
  options: {
    items: "value",
    range: "value",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    expanded: "list",
    defaultExpanded: "list",
    onExpandedChange: "callback",
    onHighlight: "callback",
    format: "value",
    locale: "string",
    getBarLabel: "value",
    controller: "value",
  },
  controlled: ["value", "expanded"],
  state: (options: WaterfallOptions): WaterfallStore => ({
    items: options.items ?? [],
    range: options.range,
    value: options.defaultValue ?? null,
    expanded: options.defaultExpanded ?? [],
    active: null,
    cell: null,
    format: options.format,
    locale: options.locale,
    pageLocale: null,
    getBarLabel: options.getBarLabel,
  }),
  sync: (options) => ({
    items: options.items ?? [],
    range: options.range,
    format: options.format,
    locale: options.locale,
    getBarLabel: options.getBarLabel,
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.expanded === undefined ? {} : { expanded: options.expanded }),
  }),
  api: waterfallApi,
  slots: (slot) => ({
    root: slot<{}, WaterfallState>({
      role: "treegrid",
      keys: {
        none: "Focus stays on a row or a cell, whose keydown handles them.",
      },
      selects: selects(noRowReads),
      state: (state, { api }) => ({ range: api.internal.range(state) }),
      bind: (el, { store, id }) => {
        bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
        if (dev) {
          checkName(el, "Waterfall", { component: "waterfall", id })
        }
      },
    }),

    // The row of column headers, above the rows.
    "header-row": slot({ role: "row" }),

    "column-header": slot({ role: "columnheader" }),

    // The ruler of round times above the bars. Hidden from screen readers, which hear each bar's times.
    axis: slot<WaterfallAxisProps, WaterfallAxisState>({
      props: { maxTicks: "number" },
      selects: selects(noRowReads),
      state: (state, { props, api }) => ({
        ticks: api.internal.ticks(state, props.maxTicks ?? 6),
      }),
      attrs: () => ({ "aria-hidden": "true" }),
    }),

    tick: slot<WaterfallTimeProps, WaterfallTimeState>({
      props: { time: "number" },
      selects: selects(noRowReads),
      state: (state, { props, api }) =>
        api.internal.timeState(state, props.time),
      attrs: (state, { props, api }) => ({
        style: css({
          "--waterfall-tick": `${api.internal.timeState(state, props.time).position}%`,
        }),
      }),
    }),

    // A moment across every row, like DOMContentLoaded.
    mark: slot<WaterfallTimeProps, WaterfallTimeState>({
      props: { time: "number" },
      selects: selects(noRowReads),
      state: (state, { props, api }) =>
        api.internal.timeState(state, props.time),
      attrs: (state, { props, api }) => {
        const mark = api.internal.timeState(state, props.time)
        return {
          "data-outside": flag(mark.outside),
          style: css({ "--waterfall-mark": `${mark.position}%` }),
        }
      },
    }),

    row: slot<WaterfallRowProps, WaterfallRowState>({
      role: "row",
      keys: [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "mod+Home",
        "mod+End",
        "PageUp",
        "PageDown",
        "Enter",
        " ",
        "typeahead",
      ],
      props: { value: "string" },
      // A row hears its own selection and focus, and an expand of itself or of an ancestor, which hides or shows it.
      selects: selects({
        value: ({ key }) => [key],
        active: ({ key }) => [key, null],
        cell: ({ key }) => [key],
        expanded: ({ key, api }) => [key, ...api.internal.ancestors(key)],
      }),
      direct: direct(["hidden"]),
      state: (state, { key, api }) => rowState(state, key, api),
      attrs: (state, part) => {
        const { id, key, api } = part
        const row = rowState(state, key, api)
        const position = api.internal.position(key)
        const placement = api.internal.placement(state, key)
        return {
          id: `${id}-row-${idPart(key)}`,
          tabindex: api.internal.tabIndex(state, part),
          hidden: api.internal.shows(key, state.expanded) ? undefined : "",
          "aria-level": String(row.level),
          "aria-posinset": position && String(position.index),
          "aria-setsize": position && String(position.size),
          "aria-expanded": row.branch ? String(row.expanded) : undefined,
          "aria-selected": row.selected ? "true" : undefined,
          ...rowDataAttrs(row),
          style: css({
            "--waterfall-level": row.level,
            "--waterfall-start": `${placement.start}%`,
            "--waterfall-size": `${placement.size}%`,
          }),
        }
      },
      press: ({ api, key, el }, event) => api.internal.press(key, el, event),
      on: {
        keydown: (event, { api, el, key }) =>
          el && api.internal.keydown(event as KeyboardEvent, el, key),
        focusin: (event, { api, el, key }) =>
          el && api.internal.focusin(event as FocusEvent, el, key),
      },
      bind: (el, part) => part.api.internal.bindRow(el, part),
    }),

    // The cell that names the span, which screen readers repeat as focus moves down a column.
    "row-header": slot<RowPartProps, WaterfallRowState>({
      role: "rowheader",
      props: { value: { kind: "string", from: "row" } },
      selects: selects(rowPartReads),
      state: (state, { props, api }) => rowState(state, rowOf(props), api),
      attrs: (state, { props, api }) => ({
        ...rowDataAttrs(rowState(state, rowOf(props), api)),
      }),
      bind: (el) => bindCell(el),
    }),

    // The arrow that expands and collapses a span.
    indicator: slot<RowPartProps, WaterfallRowState>({
      props: { value: { kind: "string", from: "row" } },
      selects: selects(rowPartReads),
      state: (state, { props, api }) => rowState(state, rowOf(props), api),
      attrs: (state, { props, api }) => ({
        "aria-hidden": "true",
        ...rowDataAttrs(rowState(state, rowOf(props), api)),
      }),
      press: ({ api, props }, event) =>
        api.internal.pressIndicator(rowOf(props), event),
    }),

    cell: slot<RowPartProps, WaterfallRowState>({
      role: "gridcell",
      focus: "roving",
      props: { value: { kind: "string", from: "row" } },
      selects: selects(rowPartReads),
      state: (state, { props, api }) => rowState(state, rowOf(props), api),
      attrs: (state, { props, api }) => ({
        ...rowDataAttrs(rowState(state, rowOf(props), api)),
      }),
      bind: (el) => bindCell(el),
    }),

    // The cell on the time axis. Style its bar from the row's `--waterfall-start` and `--waterfall-size`.
    bar: slot<RowPartProps, WaterfallRowState>({
      role: "gridcell",
      focus: "roving",
      props: { value: { kind: "string", from: "row" } },
      selects: selects(rowPartReads),
      state: (state, { props, api }) => rowState(state, rowOf(props), api),
      attrs: (state, { props, api }) => ({
        "aria-label": api.internal.barLabel(state, rowOf(props)),
        ...rowDataAttrs(rowState(state, rowOf(props), api)),
      }),
      bind: (el) => bindCell(el),
    }),
  }),
  agent: {
    actions: [
      "setValue",
      "setExpanded",
      "expand",
      "collapse",
      "expandAll",
      "collapseAll",
    ],
    items: (api) => api.internal.items(),
  },
})

// Cells take focus from the arrow keys and a click, never from Tab while another holds the stop.
function bindCell(el: HTMLElement) {
  if (!el.hasAttribute("tabindex")) {
    el.tabIndex = -1
  }
}

/**
 * The type of `waterfall`.
 * @experimental
 */
interface WaterfallPrimitive extends Named<typeof waterfallPrimitive> {}

/**
 * The waterfall primitive: a tree of spans laid out on a shared time axis, as
 * a WAI-ARIA treegrid. Slots: `root`, `header-row`, `column-header`, `axis`,
 * `tick`, `mark`, `row`, `row-header`, `indicator`, `cell` and `bar`.
 * @experimental
 */
const waterfall: WaterfallPrimitive = waterfallPrimitive

export {
  createWaterfallController,
  waterfall,
  type WaterfallAxisProps,
  type WaterfallAxisState,
  type WaterfallBarLabelDetails,
  type WaterfallChangeOptions,
  type WaterfallController,
  type WaterfallData,
  type WaterfallDataItem,
  type WaterfallDataRow,
  type WaterfallExpandedChangeReason,
  type WaterfallOptions,
  type WaterfallPrimitive,
  type WaterfallRowPartProps,
  type WaterfallRowProps,
  type WaterfallRowState,
  type WaterfallState,
  type WaterfallTimeProps,
  type WaterfallTimeState,
  type WaterfallValueChangeReason,
}
export { visibleWaterfallRows } from "./waterfall-api"
export type { WaterfallApi } from "./waterfall-api"
export type { WaterfallTickData } from "./waterfall-time"
export type { ListHighlightDetails } from "../../foundation/lists/listbox"
export type { NumberFormat } from "../../foundation/number/format"
