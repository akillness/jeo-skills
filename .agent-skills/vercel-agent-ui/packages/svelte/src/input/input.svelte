<!--
@component
A native <input>, wired to the Field it's in.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    input as inputPrimitive,
    type InputState,
    type InputValueChangeReason,
  } from "@ui-sdk/core/input"
  import { useFieldControl } from "../field/context"
  import NativeInput from "../native-input.svelte"
  import {
    controlProps,
    elementProps,
    type TextControlProps,
    type TextPartProps,
  } from "../text-control"
  import { useHandlePart, usePrimitive } from "../use-primitive.svelte"

  let {
    value = $bindable(),
    defaultValue,
    disabled,
    readOnly,
    required,
    controller,
    debug,
    onValueChange,
    render,
    children,
    ...rest
  }: TextPartProps<"input", InputState> & TextControlProps = $props()

  const id = $props.id()
  const field = useFieldControl()
  const input = usePrimitive(inputPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    controller,
    debug,
    onValueChange: (
      next: string,
      details: ChangeDetails<InputValueChangeReason>
    ) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  // Controlled from the start, or once the parent sets it, like `bind:value` to a variable that starts empty.
  const controlled = $derived(input.controls("value"))
  const states = () => ({ disabled, readOnly, required })
  const root = useHandlePart(input, "root", () =>
    controlProps(states(), field, rest)
  )
  const control = field?.control(
    () => rest.id as string | undefined,
    () => rest["aria-describedby"]
  )
  // A controlled value is the DOM property, which the spread writes on every
  // change. A default is the `value` attribute, which a form reset returns to,
  // and which the server renders.
  const element = () => ({
    ...elementProps(states(), field, rest),
    ...(controlled ? { value } : { defaultValue }),
  })
</script>

<NativeInput
  {render}
  {children}
  props={control ? control(root.slot(element())) : root.slot(element())}
  state={root.state}
/>
