<!--
@component
Checkboxes that share a name and a list of checked values. The group, not
each checkbox, sits in a field.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    checkboxGroup as checkboxGroupPrimitive,
    type CheckboxGroupController,
    type CheckboxGroupState,
    type CheckboxGroupValueChangeReason,
  } from "@ui-sdk/core/checkbox"
  import { setContext } from "svelte"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import { CheckboxGroupKey } from "./context"

  type Details = ChangeDetails<CheckboxGroupValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    allValues,
    disabled,
    readOnly,
    required,
    name,
    form,
    controller,
    debug,
    onValueChange,
    ...rest
  }: PartProps<"div", CheckboxGroupState> & {
    /** The checked values. Bind it with `bind:value` to control the group. */
    value?: string[]
    /** The checked values at first, when uncontrolled. A form reset returns to them. */
    defaultValue?: string[]
    /** Every value in the group, for a parent checkbox to check them all. */
    allValues?: string[]
    /** Disables every checkbox in the group. */
    disabled?: boolean
    /** Makes every checkbox in the group read-only: focusable and submitted, but presses don't change it. */
    readOnly?: boolean
    /** Blocks form submission until a value is checked. */
    required?: boolean
    /** The name the values submit under. */
    name?: string
    /** The id of a form to belong to, when it isn't inside that form. */
    form?: string
    /** Drives the group from anywhere. Create one with `createCheckboxGroupController()`. */
    controller?: CheckboxGroupController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when a checkbox or a form reset wants to change the values. `details.cancel()` stops it. */
    onValueChange?: (value: string[], details: Details) => void
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const group = usePrimitive(checkboxGroupPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    allValues,
    disabled: disabled || field?.disabled(),
    readOnly,
    required,
    name: name ?? field?.name(),
    form,
    controller,
    debug,
    onValueChange: (next: string[], details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  setContext(CheckboxGroupKey, group)
  const root = useHandlePart(group, "group")
  const input = useHandlePart(group, "group-input")
  const control = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
</script>

<Part tag="div" part={wrapPart(root, control)} props={rest} />
<input {...input.slot()} />
