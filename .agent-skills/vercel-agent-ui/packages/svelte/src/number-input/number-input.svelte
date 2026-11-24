<!--
@component
The root, and the hidden input that submits the number as is.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    numberInput as numberInputPrimitive,
    type NumberInputOptions,
    type NumberInputState,
    type NumberInputValueChangeReason,
  } from "@ui-sdk/core/number-input"
  import { setContext } from "svelte"
  import { useControllerEntry } from "../controller-target.svelte"
  import { useFieldControl, useFieldControlId } from "../field/context"
  import Part from "../part.svelte"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { NumberInputKey, type NumberInputContext } from "./context"

  type Value = number | null

  let {
    value = $bindable(),
    defaultValue,
    min,
    max,
    step,
    largeStep,
    smallStep,
    format,
    locale,
    wheel,
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
  }: PartProps<"div", NumberInputState> &
    Omit<NumberInputOptions, "value"> & {
      /** The value, or null for an empty field. Bind it with `bind:value` to control the field. */
      value?: Value
    } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const controlId = useFieldControlId()
  const numberInput = usePrimitive(numberInputPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    min,
    max,
    step,
    largeStep,
    smallStep,
    format,
    locale,
    wheel,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    required,
    name: name ?? field?.name(),
    form,
    controller,
    debug,
    controlId,
    onValueChange: (
      next: Value,
      details: ChangeDetails<NumberInputValueChangeReason>
    ) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onValueCommit,
  }))
  const context: NumberInputContext = { ...numberInput, field }
  setContext(NumberInputKey, context)
  useControllerEntry(() => controller, context)
  const root = useHandlePart(numberInput, "root")
  const hidden = useHandlePart(numberInput, "hidden-input")
</script>

<Part tag="div" part={root} props={rest} />
<input {...hidden.slot()} />
