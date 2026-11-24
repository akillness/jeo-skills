import {
  waterfall as waterfallPrimitive,
  type ListHighlightDetails,
  type NumberFormat,
  type WaterfallBarLabelDetails,
  type WaterfallController,
  type WaterfallData,
  type WaterfallDataItem,
  type WaterfallExpandedChangeReason,
  type WaterfallValueChangeReason,
} from "@ui-sdk/core/waterfall"
import type { ChangeDetails } from "@ui-sdk/core"
import { computed, defineComponent, h, type PropType } from "vue"
import { slotContent } from "./children"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"

// The parts inside a row take its `value` from it.
const parts = createParts(waterfallPrimitive, {
  "header-row": "div",
  "column-header": "div",
  mark: "span",
  row: "div",
  "row-header": "div",
  indicator: "span",
  cell: "div",
  bar: "div",
})

type Value = string | null

/**
 * A trace's spans on a shared time axis, as a tree of rows you expand and
 * collapse, with one tab stop. Without content, it renders a row for every span.
 * @experimental
 */
const Waterfall = withElement(
  "div",
  defineComponent({
    name: "Waterfall",
    inheritAttrs: false,
    props: {
      items: { type: Array as PropType<WaterfallData>, required: true },
      range: Array as unknown as PropType<[number, number]>,
      value: { type: null as unknown as PropType<Value>, default: undefined },
      modelValue: {
        type: null as unknown as PropType<Value>,
        default: undefined,
      },
      defaultValue: {
        type: null as unknown as PropType<Value>,
        default: undefined,
      },
      expanded: { type: Array as PropType<string[]>, default: undefined },
      defaultExpanded: {
        type: Array as PropType<string[]>,
        default: undefined,
      },
      format: [Object, Function] as PropType<NumberFormat>,
      locale: String,
      getBarLabel: Function as PropType<
        (item: WaterfallDataItem, details: WaterfallBarLabelDetails) => string
      >,
      controller: Object as PropType<WaterfallController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: Value) => true,
      "update:modelValue": (_value: Value) => true,
      valueChange: (
        _value: Value,
        _details: ChangeDetails<WaterfallValueChangeReason>
      ) => true,
      "update:expanded": (_expanded: string[]) => true,
      expandedChange: (
        _expanded: string[],
        _details: ChangeDetails<WaterfallExpandedChangeReason>
      ) => true,
      highlight: (_value: string, _details: ListHighlightDetails) => true,
    },
    slots: Object as PartSlots<typeof waterfallPrimitive, "root">,
    setup(props, { slots, emit }) {
      const waterfall = usePrimitive(waterfallPrimitive, () => ({
        ...props,
        value: orModel(props.value, props.modelValue),
        onValueChange: (
          value: Value,
          details: ChangeDetails<WaterfallValueChangeReason>
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onExpandedChange: (
          expanded: string[],
          details: ChangeDetails<WaterfallExpandedChangeReason>
        ) => {
          emit("expandedChange", expanded, details)
          if (!details.canceled) {
            emit("update:expanded", expanded)
          }
        },
        onHighlight: (value: string, details: ListHighlightDetails) =>
          emit("highlight", value, details),
      }))
      // The core reads the spans from `items`, so they're read here to stay in sync.
      const spans = computed(() => {
        void waterfall.state.items
        return waterfall.api.internal.all()
      })
      return usePart(waterfall, "root", undefined, undefined, {
        tag: "div",
        // Without content, it renders a row for every span.
        children: (state) =>
          slotContent(slots.default, { state }) ??
          spans.value.map((item) =>
            h(WaterfallRow, { key: item.value, value: item.value }, () => [
              h(WaterfallRowHeader, null, () => [
                item.children && h(WaterfallIndicator),
                item.label,
              ]),
              h(WaterfallBar),
            ])
          ),
      })
    },
  })
)

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
 * One time on the axis, placed by `--waterfall-tick`. Without content, it shows the time.
 * @experimental
 */
const WaterfallTick = withElement(
  "span",
  defineComponent({
    name: "WaterfallTick",
    inheritAttrs: false,
    props: { time: { type: Number, required: true } },
    slots: Object as PartSlots<typeof waterfallPrimitive, "tick">,
    setup(props, { slots }) {
      return usePart(
        waterfallPrimitive,
        "tick",
        () => ({ time: props.time }),
        undefined,
        {
          tag: "span",
          children: (state) =>
            slotContent(slots.default, { state }) ?? state.label,
        }
      )
    },
  })
)

/**
 * The ruler of round times above the bars, hidden from screen readers. Without content, it renders its ticks.
 * @experimental
 */
const WaterfallAxis = withElement(
  "div",
  defineComponent({
    name: "WaterfallAxis",
    inheritAttrs: false,
    props: { maxTicks: Number },
    slots: Object as PartSlots<typeof waterfallPrimitive, "axis">,
    setup(props, { slots }) {
      return usePart(
        waterfallPrimitive,
        "axis",
        () => ({ maxTicks: props.maxTicks }),
        undefined,
        {
          tag: "div",
          children: (state) =>
            slotContent(slots.default, { state }) ??
            state.ticks.map((tick) =>
              h(WaterfallTick, { key: tick.time, time: tick.time })
            ),
        }
      )
    },
  })
)

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
}

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
