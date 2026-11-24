<!--
@component
Radios that share one value, with one tab stop and arrow keys between them.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    radioGroup as radioGroupPrimitive,
    type RadioGroupController,
    type RadioGroupState,
    type RadioGroupValueChangeReason,
  } from "@ui-sdk/core/radio"
  import { setContext } from "svelte"
  import { useField, useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import { GroupFieldKey, RadioGroupKey } from "./context"

  type Details = ChangeDetails<RadioGroupValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    disabled,
    readOnly,
    required,
    name,
    form,
    loop,
    controller,
    debug,
    onValueChange,
    ...rest
  }: PartProps<"div", RadioGroupState> & {
    /** The checked value, or null. Bind it with `bind:value` to control the group. */
    value?: string | null
    /** The checked value at first, when uncontrolled. A form reset returns to it. */
    defaultValue?: string | null
    /** Disables every radio in the group. */
    disabled?: boolean
    /** Keeps the radios focusable and submitted, but stops changes. */
    readOnly?: boolean
    /** Blocks form submission until a radio is checked. */
    required?: boolean
    /** The name the value submits under. */
    name?: string
    /** The id of a form to belong to, when it isn't inside that form. */
    form?: string
    /** Whether arrow keys wrap around at the ends. */
    loop?: boolean
    /** Drives the group from anywhere. Create one with `createRadioGroupController()`. */
    controller?: RadioGroupController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when a radio or a form reset wants to change the value. `details.cancel()` stops it. */
    onValueChange?: (value: string | null, details: Details) => void
  } = $props()

  const id = $props.id()
  setContext(GroupFieldKey, useField())
  const field = useFieldControl()
  const group = usePrimitive(radioGroupPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    required,
    name: name ?? field?.name(),
    form,
    loop,
    controller,
    debug,
    onValueChange: (next: string | null, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  setContext(RadioGroupKey, group)
  const root = useHandlePart(group, "group")
  const control = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
</script>

<Part tag="div" part={wrapPart(root, control)} props={rest} />
