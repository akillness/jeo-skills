import {
  waterfall as waterfallPrimitive,
  type WaterfallAxisState,
  type WaterfallDataItem,
  type WaterfallOptions,
  type WaterfallTimeState,
} from "@ui-sdk/core/waterfall"
import { For, Show, type ComponentProps } from "solid-js"
import { createParts } from "./use-primitive"

const parts = createParts(waterfallPrimitive, {
  root: "div",
  "header-row": "div",
  "column-header": "div",
  axis: "div",
  tick: "span",
  mark: "span",
  row: "div",
  "row-header": "div",
  indicator: "span",
  cell: "div",
  bar: "div",
})

/**
 * The props of `Waterfall`.
 * @experimental
 */
type WaterfallProps = WaterfallOptions &
  Omit<ComponentProps<typeof parts.Root>, keyof WaterfallOptions> & {}

/**
 * A trace's spans on a shared time axis, as a tree of rows you expand and
 * collapse, with one tab stop. Without children, it renders a row for every span.
 * @experimental
 */
function Waterfall(props: WaterfallProps) {
  return (
    <parts.Root {...props}>
      {props.children ?? <WaterfallRows items={props.items} />}
    </parts.Root>
  )
}

// check-code: allow return-type recursive, so TypeScript cannot infer it.
const everySpan = (items: WaterfallDataItem[]): WaterfallDataItem[] =>
  items.flatMap((item) => [item, ...everySpan(item.children ?? [])])

function WaterfallRows(props: { items: WaterfallDataItem[] }) {
  return (
    <For each={everySpan(props.items)}>
      {(item) => (
        <WaterfallRow value={item.value}>
          <WaterfallRowHeader>
            <Show when={item.children}>
              <WaterfallIndicator />
            </Show>
            {item.label}
          </WaterfallRowHeader>
          <WaterfallBar />
        </WaterfallRow>
      )}
    </For>
  )
}

/**
 * The row of column headers, above the rows.
 * @experimental
 */
const WaterfallHeaderRow = parts.HeaderRow

/**
 * A column's header, like "Name" or "Timeline".
 * @experimental
 */
const WaterfallColumnHeader = parts.ColumnHeader

/**
 * The ruler of round times above the bars, hidden from screen readers. Without children, it renders its ticks.
 * @experimental
 */
function WaterfallAxis(props: ComponentProps<typeof parts.Axis>) {
  return (
    <parts.Axis {...props}>
      {props.children ??
        ((state: WaterfallAxisState) => (
          <For each={state.ticks} keyed={(tick) => tick.time}>
            {(tick) => <WaterfallTick time={tick().time} />}
          </For>
        ))}
    </parts.Axis>
  )
}

/**
 * One time on the axis, placed by `--waterfall-tick`. Without children, it shows the time.
 * @experimental
 */
function WaterfallTick(props: ComponentProps<typeof parts.Tick>) {
  return (
    <parts.Tick {...props}>
      {props.children ?? ((state: WaterfallTimeState) => state.label)}
    </parts.Tick>
  )
}

/**
 * A moment across every row, like DOMContentLoaded, placed by `--waterfall-mark`.
 * @experimental
 */
const WaterfallMark = parts.Mark

/**
 * One span's row. Its `--waterfall-start` and `--waterfall-size` place the span's bar.
 * @experimental
 */
const WaterfallRow = parts.Row

/**
 * The cell that names the span. Put the indicator and the span's label in it.
 * @experimental
 */
const WaterfallRowHeader = parts.RowHeader

/**
 * The arrow that expands and collapses a span with children.
 * @experimental
 */
const WaterfallIndicator = parts.Indicator

/**
 * A cell of your own, like a status or a size.
 * @experimental
 */
const WaterfallCell = parts.Cell

/**
 * The cell on the time axis, which screen readers hear as the span's start and duration.
 * @experimental
 */
const WaterfallBar = parts.Bar

export {
  createWaterfallController,
  visibleWaterfallRows,
} from "@ui-sdk/core/waterfall"
export type {
  ListHighlightDetails,
  NumberFormat,
  WaterfallApi,
  WaterfallAxisProps,
  WaterfallAxisState,
  WaterfallBarLabelDetails,
  WaterfallChangeOptions,
  WaterfallController,
  WaterfallData,
  WaterfallDataItem,
  WaterfallDataRow,
  WaterfallExpandedChangeReason,
  WaterfallOptions,
  WaterfallPrimitive,
  WaterfallRowPartProps,
  WaterfallRowProps,
  WaterfallRowState,
  WaterfallState,
  WaterfallTickData,
  WaterfallTimeProps,
  WaterfallTimeState,
  WaterfallValueChangeReason,
} from "@ui-sdk/core/waterfall"

export {
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallCell,
  WaterfallColumnHeader,
  WaterfallHeaderRow,
  WaterfallIndicator,
  WaterfallMark,
  WaterfallRow,
  WaterfallRowHeader,
  WaterfallTick,
  type WaterfallProps,
}
