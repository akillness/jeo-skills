<!--
@component
The control and the hidden native input that takes part in the form.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    checkbox as checkboxPrimitive,
    type CheckboxCheckedChangeReason,
    type CheckboxController,
    type CheckboxState,
    type CheckedState,
  } from "@ui-sdk/core/checkbox"
  import { setContext } from "svelte"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import type { ToggleProps } from "../toggle-props"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import { CheckboxKey, useCheckboxGroup } from "./context"

  type Details = ChangeDetails<CheckboxCheckedChangeReason>

  let {
    checked = $bindable(),
    defaultChecked,
    parent,
    controller,
    disabled,
    readOnly,
    required,
    name,
    value,
    form,
    debug,
    onCheckedChange,
    ...rest
  }: PartProps<"button", CheckboxState> &
    ToggleProps & {
      /** Whether it's checked. Bind it with `bind:checked` to control the checkbox. */
      checked?: CheckedState
      /** Whether it's checked at first, when uncontrolled. A form reset returns to it. */
      defaultChecked?: CheckedState
      /** Makes it the parent of its group: checked when every value is, indeterminate for some. */
      parent?: boolean
      /** Toggles it from anywhere. Create one with `createCheckboxController()`. */
      controller?: CheckboxController
      /** Runs when a user or a form reset wants to change it. `details.cancel()` stops it. */
      onCheckedChange?: (checked: CheckedState, details: Details) => void
    } = $props()

  const id = $props.id()
  const group = useCheckboxGroup()
  // Inside a group, the group is the field's control.
  const field = group ? null : useFieldControl()
  const checkbox = usePrimitive(checkboxPrimitive, () => ({
    id,
    parent,
    group: group ? () => group.api : undefined,
    get checked() {
      return checked
    },
    defaultChecked,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    required,
    name: name ?? field?.name(),
    value,
    form,
    controller,
    debug,
    onCheckedChange: (next: CheckedState, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `checked` as it was.
      onCheckedChange?.(next, details)
      if (!details.canceled) {
        checked = next
      }
    },
  }))
  setContext(CheckboxKey, checkbox)
  const root = useHandlePart(checkbox, "root")
  const input = useHandlePart(checkbox, "input")
  const control = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
</script>

<Part tag="button" part={wrapPart(root, control)} props={rest} />
<input {...input.slot()} />
