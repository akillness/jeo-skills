<!--
@component
Holds the field and its toggle. Presses on its own text and icons focus the field.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    passwordInput as passwordInputPrimitive,
    type InputValueChangeReason,
    type PasswordInputOptions,
    type PasswordInputState,
    type PasswordInputVisibleChangeReason,
  } from "@ui-sdk/core/password-input"
  import { setContext } from "svelte"
  import { useFieldControl, useFieldControlId } from "../field/context"
  import Part from "../part.svelte"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { PasswordInputKey, type PasswordInputContext } from "./context"

  let {
    value = $bindable(),
    defaultValue,
    visible = $bindable(),
    defaultVisible,
    autoComplete,
    name,
    form,
    required,
    disabled,
    readOnly,
    controller,
    debug,
    onValueChange,
    onVisibleChange,
    ...rest
  }: PartProps<"div", PasswordInputState> &
    Omit<PasswordInputOptions, "value" | "visible"> & {
      /** The password. Bind it with `bind:value` to control the field. */
      value?: string
      /** Whether the password is shown. Bind it with `bind:visible` to control it. */
      visible?: boolean
    } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const controlId = useFieldControlId()
  const passwordInput = usePrimitive(passwordInputPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    get visible() {
      return visible
    },
    defaultVisible,
    autoComplete,
    name: name ?? field?.name(),
    form,
    required,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    controller,
    debug,
    controlId,
    // The callbacks run first, so canceling there also keeps a bound value as it was.
    onValueChange: (
      next: string,
      details: ChangeDetails<InputValueChangeReason>
    ) => {
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onVisibleChange: (
      next: boolean,
      details: ChangeDetails<PasswordInputVisibleChangeReason>
    ) => {
      onVisibleChange?.(next, details)
      if (!details.canceled) {
        visible = next
      }
    },
  }))
  const context: PasswordInputContext = {
    ...passwordInput,
    field,
    value: () => value,
    defaultValue: () => defaultValue,
  }
  setContext(PasswordInputKey, context)
  const root = useHandlePart(passwordInput, "root")
</script>

<Part tag="div" part={root} props={rest} />
