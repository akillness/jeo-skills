// What Date Input and Time Input render alike: the root with its segments and
// hidden input, and a segment, which is an input or the text between inputs.
import type {
  dateInput,
  DateInputSegmentData,
  DateInputSegmentState,
  DateInputState,
} from "@ui-sdk/core/date-input"
import * as React from "react"
import { controlRender, type useFieldControl } from "./field-context"
import {
  renderElement,
  usePart,
  type PartProps,
  type usePrimitive,
} from "./use-primitive"

type RootProps = Omit<
  PartProps<"div", DateInputState>,
  "defaultValue" | "onChange"
>

type SegmentProps = Omit<
  PartProps<"input", DateInputSegmentState>,
  "value" | "defaultValue" | "children"
> & {
  /** The segment it shows, from the root's `segments`. */
  segment: DateInputSegmentData
  /** The text between segments, which it shows unless it has children. Segments you type in take none. */
  children?: React.ReactNode
}

// Time Input's primitive has the same slots and state.
type Segmented = typeof dateInput

// The core writes an input's text as it changes, so React only renders where it starts.
function useSegment(
  primitive: Segmented,
  { segment, render, children, ...props }: SegmentProps
) {
  const own = { segment, id: segment.key }
  const input = (merged: Record<string, any>, state: DateInputSegmentState) => {
    const { value, ...rest } = merged
    return renderElement(
      "input",
      { ...rest, defaultValue: value },
      render,
      state
    )
  }
  const part = segment.editable
    ? { ...props, render: input }
    : { ...props, render, children: children ?? segment.text }
  return usePart(
    primitive,
    "segment",
    own,
    part as object,
    segment.editable ? "input" : "span"
  )
}

function useSegmentedRoot(
  primitive: Segmented,
  instance: ReturnType<typeof usePrimitive<Segmented>>,
  field: ReturnType<typeof useFieldControl>,
  { render, children, ...props }: RootProps,
  Segment: (props: SegmentProps) => React.ReactNode
) {
  const content = (state: DateInputState) => (
    <>
      {children === undefined
        ? state.segments.map((segment) => (
            <Segment key={segment.key} segment={segment} />
          ))
        : typeof children === "function"
          ? children(state)
          : children}
      <HiddenInput primitive={primitive} />
    </>
  )
  return usePart(
    instance,
    "root",
    {},
    { ...props, children: content, render: controlRender(field, "div", render) }
  )
}

function HiddenInput({ primitive }: { primitive: Segmented }) {
  return usePart(primitive, "hidden-input", {}, {}, "input")
}

export {
  useSegment,
  useSegmentedRoot,
  type RootProps,
  type SegmentProps,
  type Segmented,
}
