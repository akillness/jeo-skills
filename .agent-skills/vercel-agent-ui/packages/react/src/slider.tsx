import {
  slider as sliderPrimitive,
  type SliderOptions,
  type SliderState,
  type SliderThumbProps,
  type SliderThumbState,
  type SliderValueState,
} from "@ui-sdk/core/slider"
import * as React from "react"
import {
  controlRender,
  useFieldControl,
  useFieldControlId,
} from "./field-context"
import {
  createParts,
  extendHandle,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(sliderPrimitive, {
  control: "div",
  track: "div",
  indicator: "div",
  value: "output",
})

type SliderContextValue = PrimitiveHandle<typeof sliderPrimitive> & {
  // The field a single thumb's input joins. A range joins it on the root instead.
  field: ReturnType<typeof useFieldControl>
}

const SliderContext = React.createContext<SliderContextValue | null>(null)

function useSlider(part: string) {
  const context = React.useContext(SliderContext)
  if (!context) {
    throw new Error(`${part} must be used inside <Slider>.`)
  }
  return context
}

type DivProps<State> = Omit<
  PartProps<"div", State>,
  "defaultValue" | "onChange" | "onSelect"
>

// Content, then what the part adds after it, with function children resolved.
function withAfter<State>(
  children: DivProps<State>["children"],
  after: React.ReactNode
) {
  return (state: State) => (
    <>
      {typeof children === "function" ? children(state) : children}
      {after}
    </>
  )
}

/**
 * The root: a group around the thumbs, and the hidden input the form submits.
 * @stable
 */
function Slider<Value extends number | number[] = number | number[]>({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min,
  max,
  step,
  largeStep,
  minStepsBetweenThumbs,
  orientation,
  disabled,
  readOnly,
  required,
  name,
  form,
  format,
  locale,
  controller,
  debug,
  render,
  children,
  ...props
}: SliderOptions<Value> & DivProps<SliderState>) {
  const field = useFieldControl()
  const controlId = useFieldControlId()
  const slider = usePrimitive(sliderPrimitive, {
    value,
    defaultValue,
    onValueChange: onValueChange as SliderOptions["onValueChange"],
    onValueCommit: onValueCommit as SliderOptions["onValueCommit"],
    min,
    max,
    step,
    largeStep,
    minStepsBetweenThumbs,
    orientation,
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    format,
    locale,
    controller,
    debug,
    thumbInputId: controlId,
  })
  // A range is a group the field's label names. A single thumb is the control itself.
  const shape = value ?? defaultValue
  const range = Array.isArray(shape) && shape.length > 1
  const context = React.useMemo(
    () => extendHandle(slider, { field: range ? null : field }),
    [slider, range, field]
  )
  const root = {
    ...props,
    children: withAfter(children, <HiddenInput />),
    render: controlRender(range ? field : null, "div", render),
  }
  return (
    <SliderContext.Provider value={context}>
      {usePart(slider, "root", {}, root)}
    </SliderContext.Provider>
  )
}

// The hidden input the form submits.
function HiddenInput() {
  return usePart(sliderPrimitive, "input", {}, {}, "input")
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
function SliderThumb({
  index = 0,
  children,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  ...props
}: DivProps<SliderThumbState> & SliderThumbProps) {
  // Thumbs are told apart by their index.
  const thumb = { index, id: String(index) }
  const input = (
    <ThumbInput
      {...thumb}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    />
  )
  return usePart(sliderPrimitive, "thumb", thumb, {
    ...props,
    children: withAfter(children, input),
  })
}

// The native range input inside a thumb, which takes focus.
function ThumbInput({
  index,
  id,
  ...named
}: { index: number; id: string } & Pick<
  React.ComponentProps<"input">,
  "aria-label" | "aria-labelledby" | "aria-describedby"
>) {
  const { field } = useSlider("SliderThumb")
  // The core writes the input's value, so React only renders where it starts.
  const render = (input: Record<string, any>) => {
    const { value, ...rest }: Record<string, any> = field
      ? field.props(input)
      : input
    return <input {...rest} defaultValue={value} />
  }
  return usePart(
    sliderPrimitive,
    "thumb-input",
    { index, id },
    { ...named, render },
    "input"
  )
}

/**
 * The formatted value, a range joined with an en dash. Children replace it.
 * @stable
 */
function SliderValue({
  children = text,
  ...props
}: PartProps<"output", SliderValueState>) {
  return <parts.Value {...props}>{children}</parts.Value>
}

const text = (state: SliderValueState) => state.text

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
