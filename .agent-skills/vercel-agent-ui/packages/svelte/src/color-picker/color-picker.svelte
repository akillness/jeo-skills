<!--
@component
The root: a group around the picker's parts, and the hidden input the form submits.
@experimental
-->
<script lang="ts">
  import {
    colorPicker,
    type ColorFormat,
    type ColorGamut,
    type ColorPickerController,
    type ColorPickerSpace,
    type ColorPickerState,
    type ColorPickerValueChangeDetails,
    type ColorPickerValueCommitDetails,
  } from "@ui-sdk/core/color-picker"
  import { useFieldControl } from "../field/context"
  import { provideInstance } from "../instance"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    value = $bindable(),
    defaultValue,
    space,
    format,
    gamut,
    disabled,
    readOnly,
    required,
    name,
    form,
    controller,
    debug,
    onValueChange,
    onValueCommit,
    ...rest
  }: PartProps<"div", ColorPickerState> & {
    /** The value, as a CSS color. Bind it with `bind:value` to control it. */
    value?: string
    /** The value at first, when uncontrolled. A form reset returns to it. */
    defaultValue?: string
    /** The space the parts edit in, which decides their channels. */
    space?: ColorPickerSpace
    /** How the value is written: `"hex"`, or a space in its CSS syntax. */
    format?: ColorFormat
    /** The colors the value can hold: `"srgb"`, `"p3"`, or `false` for any. */
    gamut?: ColorGamut | false
    /** Disables every part: they can't be focused or changed, and the value isn't submitted. */
    disabled?: boolean
    /** Keeps the parts focusable and the value submitted, but stops changes. */
    readOnly?: boolean
    /** Marks it required, with `data-required`. */
    required?: boolean
    /** The name the value submits under. */
    name?: string
    /** The id of a form to belong to, when it isn't inside that form. */
    form?: string
    /** Sets the value from anywhere. Create one with `createColorPickerController()`. */
    controller?: ColorPickerController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs while the value changes. `details.cancel()` stops it. */
    onValueChange?: (
      value: string,
      details: ColorPickerValueChangeDetails
    ) => void
    /** Runs once an interaction that changed the value ends. For saving. */
    onValueCommit?: (
      value: string,
      details: ColorPickerValueCommitDetails
    ) => void
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const picker = usePrimitive(colorPicker, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    space,
    format,
    gamut,
    disabled: disabled || field?.disabled(),
    readOnly,
    required,
    name: name ?? field?.name(),
    form,
    controller,
    debug,
    onValueChange: (next: string, details: ColorPickerValueChangeDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onValueCommit,
  }))
  provideInstance(colorPicker, picker)
  const root = useHandlePart(picker, "root")
  // The hidden input the form submits. Its value changes on every move.
  const input = useHandlePart(picker, "hidden-input")
  const fieldControl = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
</script>

<Part tag="div" part={wrapPart(root, fieldControl)} props={rest} />
<input {...input.slot()} />
