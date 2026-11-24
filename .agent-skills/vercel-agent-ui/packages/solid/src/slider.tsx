import {
  slider,
  type SliderState,
  type SliderThumbProps,
  type SliderThumbState,
  type SliderValueState,
} from "@ui-sdk/core/slider"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  merge,
  omit,
  Show,
  untrack,
  useContext,
  type ComponentProps,
} from "solid-js"
import { joinField, useFieldControl, useFieldControlId } from "./field-context"
import { createParts, usePart, type PartProps } from "./use-primitive"

const parts = createParts(slider, {
  root: "div",
  control: "div",
  track: "div",
  indicator: "div",
  value: "output",
})

// The field a single thumb's input joins. A range joins it on the root instead.
const ThumbFieldContext = createContext<
  () => ReturnType<typeof useFieldControl>
>(() => null)

type DivProps<State> = Omit<
  PartProps<"div", State>,
  "defaultValue" | "onChange" | "onSelect"
>

// Children that take the part's state are called with it. A function that
// takes nothing is a child component's accessor, and goes through as it is.
const resolve = (value: unknown, state: unknown) =>
  typeof value === "function" && value.length > 0 ? value(state) : value

// Content, then what the part adds after it, with function children resolved.
// The element after is made once: a children function that runs again keeps
// it in place, so the input inside a thumb never loses focus.
function withAfter<State>(children: unknown, after: JSX.Element) {
  return (state: State) => [resolve(children, state), after] as JSX.Element
}

/**
 * The root: a group around the thumbs, and the hidden input the form submits.
 * @stable
 */
function Slider<Value extends number | number[] = number | number[]>(
  props: ComponentProps<typeof parts.Root<Value>>
) {
  const field = useFieldControl()
  const controlId = useFieldControlId()
  // A range is a group the field's label names. A single thumb is the control itself.
  const range = () => {
    const shape = props.value ?? props.defaultValue
    return Array.isArray(shape) && shape.length > 1
  }
  const root = merge(
    props,
    {
      get disabled() {
        return props.disabled || field?.disabled()
      },
      get name() {
        return props.name ?? field?.name()
      },
      get children() {
        return withAfter(props.children, <SliderInput />)
      },
      thumbInputId: controlId,
    },
    field ? { render: joinRange(props, field, range) } : {}
  )
  return (
    <ThumbFieldContext value={() => (range() ? null : field)}>
      <parts.Root {...root} />
    </ThumbFieldContext>
  )
}

// Renders a range's root with the field's attributes over its own, then the
// user's `render`, again when the slider becomes or stops being a range.
function joinRange(
  props: { render?: PartProps<"div", SliderState>["render"] },
  field: NonNullable<ReturnType<typeof useFieldControl>>,
  range: () => boolean
) {
  const render = untrack(() => props.render)
  return (merged: Record<string, any>, state: SliderState) => {
    const joined = range() ? field.props(merged) : merged
    if (typeof render === "function") {
      return render(joined, state)
    }
    return <div {...joined} />
  }
}

// The hidden input the form submits.
function SliderInput() {
  return usePart(slider, "input", undefined, {}, "input")
}

/**
 * Where presses land. A press on the track moves the nearest thumb there.
 * @stable
 */
const SliderControl = parts.Control

/**
 * The rail the thumbs move along. Positions are percentages of it.
 * @stable
 */
const SliderTrack = parts.Track

/**
 * The filled part of the track: up to a single thumb, or between a range's thumbs.
 * @stable
 */
const SliderIndicator = parts.Indicator

/**
 * A thumb, with the native range input that takes focus inside it. Its
 * `aria-label`, `aria-labelledby` and `aria-describedby` go to that input.
 * @stable
 */
function SliderThumb(props: DivProps<SliderThumbState> & SliderThumbProps) {
  const field = useContext(ThumbFieldContext)
  const index = () => props.index ?? 0
  // Keyed by its index, which isn't a string value.
  const thumb = () => ({ index: index(), id: String(index()) })
  const rest = omit(
    props,
    "index",
    "aria-label",
    "aria-labelledby",
    "aria-describedby"
  )
  const named = {
    get "aria-label"() {
      return props["aria-label"]
    },
    get "aria-labelledby"() {
      return props["aria-labelledby"]
    },
    get "aria-describedby"() {
      return props["aria-describedby"]
    },
  }
  // Core writes the input's value and bounds before they render, so the
  // spread only writes again what the input already holds.
  const after = (
    <Show
      when={field()}
      keyed
      fallback={usePart(slider, "thumb-input", thumb, named, "input")}
    >
      {(field) =>
        usePart(
          slider,
          "thumb-input",
          thumb,
          joinField(field, named, "input"),
          "input"
        )
      }
    </Show>
  )
  const children = merge(rest, {
    get children() {
      return withAfter(rest.children, after)
    },
  })
  return usePart(slider, "thumb", thumb, children, "div")
}

/**
 * The formatted value, a range joined with an en dash. Children replace it.
 * @stable
 */
function SliderValue(props: ComponentProps<typeof parts.Value>) {
  return (
    <parts.Value {...props}>
      {props.children ?? ((state: SliderValueState) => state.text)}
    </parts.Value>
  )
}

export { createSliderController } from "@ui-sdk/core/slider"
export type {
  NumberFormat,
  SliderApi,
  SliderChangeOptions,
  SliderController,
  SliderOptions,
  SliderPrimitive,
  SliderState,
  SliderThumbProps,
  SliderThumbState,
  SliderValueChangeDetails,
  SliderValueChangeReason,
  SliderValueCommitDetails,
  SliderValueState,
} from "@ui-sdk/core/slider"

export {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
}
