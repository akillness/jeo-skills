<!--
@component
The root: a group around the thumbs, and the hidden input the form submits.
@stable
-->
<script lang="ts">
  import {
    slider as sliderPrimitive,
    type NumberFormat,
    type SliderController,
    type SliderState,
    type SliderValueChangeDetails,
    type SliderValueCommitDetails,
  } from "@ui-sdk/core/slider"
  import { setContext, untrack } from "svelte"
  import { useFieldControl, useFieldControlId } from "../field/context"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import { SliderKey, type SliderContext } from "./context"

  type Value = number | number[]

  let {
    value = $bindable(),
    defaultValue,
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
    onValueChange,
    onValueCommit,
    ...rest
  }: PartProps<"div", SliderState> & {
    /** The value: a number for one thumb, or one number per thumb, like `[20, 80]` for a range. Bind it with `bind:value` to control the slider. */
    value?: Value
    /** The value at first, when uncontrolled. A form reset returns to it. */
    defaultValue?: Value
    /** The lowest value. */
    min?: number
    /** The highest value. When the steps from `min` don't land on it, the highest step below it is the end. */
    max?: number
    /** How far one step moves, from `min`. */
    step?: number
    /** How far Page Up, Page Down and Shift with an arrow key move. */
    largeStep?: number
    /** How many steps apart neighbouring thumbs stay. Thumbs never pass each other. */
    minStepsBetweenThumbs?: number
    /** The slider's axis. Vertical sliders grow upward. */
    orientation?: "horizontal" | "vertical"
    /** Disables it like a native control: thumbs can't be focused or moved, and nothing is submitted. */
    disabled?: boolean
    /** Keeps it focusable and submitted, but stops drags, keys and screen reader adjustments from changing it. */
    readOnly?: boolean
    /** Marks it required, with `data-required`. A slider always has a value, so it never blocks a form. */
    required?: boolean
    /** The name it submits under: the number, or a range as `"start/end"`. Without one, it submits nothing. */
    name?: string
    /** The id of a form to belong to, when it isn't inside that form. */
    form?: string
    /** How values read, for screen readers and `SliderValue`: `Intl.NumberFormat` options, or a function of the value. */
    format?: NumberFormat
    /**
     * The locale values are formatted in. Defaults to the page's `lang`, or the
     * browser's language without one, once the page is interactive. Server
     * markup uses English until then, so it never disagrees with the client.
     */
    locale?: string
    /** Moves the slider from anywhere. Create one with `createSliderController()`. */
    controller?: SliderController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs while the value changes: on every step of a drag or a key. `details.thumb` says which thumb moved, and `details.cancel()` stops it. */
    onValueChange?: (value: Value, details: SliderValueChangeDetails) => void
    /** Runs once an interaction that changed the value ends: the pointer lifts, the key comes up, or a screen reader adjusts it. For saving. */
    onValueCommit?: (value: Value, details: SliderValueCommitDetails) => void
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const controlId = useFieldControlId()
  const slider = usePrimitive(sliderPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    min,
    max,
    step,
    largeStep,
    minStepsBetweenThumbs,
    orientation,
    disabled: disabled || field?.disabled(),
    readOnly,
    required,
    name: name ?? field?.name(),
    form,
    format,
    locale,
    controller,
    debug,
    thumbInputId: controlId,
    onValueChange: (next: Value, details: SliderValueChangeDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onValueCommit,
  }))
  // A range is a group the field's label names. A single thumb is the control
  // itself. Decided once, from the shape the slider starts with, since the
  // field's control part is made once in whichever part joins it.
  const shape = untrack(() => value ?? defaultValue)
  const isRange = Array.isArray(shape) && shape.length > 1
  setContext<SliderContext>(SliderKey, {
    ...slider,
    field: () => (isRange ? null : field),
  })
  const root = useHandlePart(slider, "root")
  // The hidden input the form submits. Its value changes on every move.
  const input = useHandlePart(slider, "input")
  const control = isRange
    ? field?.control(
        () => rest.id ?? root.attrs.id,
        () => rest["aria-describedby"]
      )
    : undefined
</script>

<Part tag="div" part={wrapPart(root, control)} props={rest} />
<input {...input.slot()} />
