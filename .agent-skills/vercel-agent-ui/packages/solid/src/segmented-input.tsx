// What Date Input and Time Input render alike: the root with its segments and
// hidden input, and a segment, which is an input or the text between inputs.
import type {
  dateInput,
  DateInputSegmentData,
  DateInputSegmentState,
  DateInputState,
} from "@ui-sdk/core/date-input"
import type { JSX } from "@solidjs/web"
import { For, merge, omit, untrack } from "solid-js"
import { joinField, type useFieldControl } from "./field-context"
import { startingText } from "./text-control"
import { usePart, type PartProps, type PrimitiveHandle } from "./use-primitive"

type RootProps = Omit<
  PartProps<"div", DateInputState>,
  "defaultValue" | "onChange" | "onSelect"
>

type SegmentProps = Omit<
  PartProps<"input", DateInputSegmentState>,
  "value" | "defaultValue" | "children" | "onSelect"
> & {
  /** The segment it shows, from the root's `segments`. */
  segment: DateInputSegmentData
  /** The text between segments, which it shows unless it has children. Segments you type in take none. */
  children?: JSX.Element | ((state: DateInputSegmentState) => JSX.Element)
}

// Time Input's primitive has the same slots and state.
type Segmented = typeof dateInput

// A segment's key, and so whether it's typed in, never changes.
function renderSegment(primitive: Segmented, props: SegmentProps) {
  const part = () => ({ segment: props.segment, id: props.segment.key })
  const rest = omit(props, "segment")
  if (untrack(() => props.segment.editable)) {
    return usePart(primitive, "segment", part, startingText(rest), "input")
  }
  const text = merge(rest, {
    get children() {
      return props.children ?? ((state: DateInputSegmentState) => state.text)
    },
  })
  return usePart(primitive, "segment", part, text as never, "span")
}

function renderRoot(
  handle: PrimitiveHandle<Segmented>,
  field: ReturnType<typeof useFieldControl>,
  props: RootProps,
  Segment: (props: SegmentProps) => JSX.Element
) {
  const hidden = handle.slot("hidden-input")
  // `props.children` is read once: every read of a JSX children getter makes the segments again.
  const content = (state: DateInputState) => {
    const children = props.children
    return (
      <>
        {children === undefined ? (
          <For each={state.segments} keyed={(segment) => segment.key}>
            {(segment) => <Segment segment={segment()} />}
          </For>
        ) : typeof children === "function" ? (
          children(state)
        ) : (
          children
        )}
        <input {...hidden} />
      </>
    )
  }
  return usePart(
    handle,
    "root",
    undefined,
    joinField(field, merge(props, { children: content }), "div"),
    "div"
  )
}

export {
  renderRoot,
  renderSegment,
  type RootProps,
  type SegmentProps,
  type Segmented,
}
