<!--
@component
A radio and the hidden native radio that takes part in the form.
@stable
-->
<script lang="ts">
  import type { RadioProps, RadioState } from "@ui-sdk/core/radio"
  import { getContext, setContext } from "svelte"
  import { useField, useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import { GroupFieldKey, RadioKey, useRadioGroup } from "./context"

  let {
    value,
    disabled,
    ...rest
  }: PartProps<"button", RadioState> & RadioProps = $props()

  const group = useRadioGroup()
  setContext(RadioKey, () => value)
  // A radio in a field of its own is that field's control. In the group's field, the group is.
  const nearest = useField()
  const field =
    nearest && nearest !== getContext(GroupFieldKey) ? useFieldControl() : null
  const item = () => ({ value, disabled: disabled || field?.disabled() })
  const root = useHandlePart(group, "root", item)
  const input = useHandlePart(group, "input", item)
  const control = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
</script>

<Part tag="button" part={wrapPart(root, control)} props={rest} />
<input {...input.slot()} />
