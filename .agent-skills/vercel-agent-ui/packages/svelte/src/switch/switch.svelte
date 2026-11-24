<!--
@component
A control that turns a setting on or off, with the hidden native input that takes part in the form.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    switchPrimitive,
    type SwitchCheckedChangeReason,
    type SwitchController,
    type SwitchState,
  } from "@ui-sdk/core/switch"
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
  import { SwitchKey } from "./context"

  type Details = ChangeDetails<SwitchCheckedChangeReason>

  let {
    checked = $bindable(),
    defaultChecked,
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
  }: PartProps<"button", SwitchState> &
    ToggleProps & {
      /** Whether it's on. Bind it with `bind:checked` to control the switch. */
      checked?: boolean
      /** Whether it's on at first, when uncontrolled. A form reset returns to it. */
      defaultChecked?: boolean
      /** Toggles it from anywhere. Create one with `createSwitchController()`. */
      controller?: SwitchController
      /** Runs when a user or a form reset wants to change it. `details.cancel()` stops it. */
      onCheckedChange?: (checked: boolean, details: Details) => void
    } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const control = usePrimitive(switchPrimitive, () => ({
    id,
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
    onCheckedChange: (next: boolean, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `checked` as it was.
      onCheckedChange?.(next, details)
      if (!details.canceled) {
        checked = next
      }
    },
  }))
  setContext(SwitchKey, control)
  const root = useHandlePart(control, "root")
  const input = useHandlePart(control, "input")
  const inField = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
</script>

<Part tag="button" part={wrapPart(root, inField)} props={rest} />
<input {...input.slot()} />
