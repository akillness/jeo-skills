<!--
@component
The root: the slots, and the one real input over them. `id`, `autofocus`
and the `aria-*` naming attributes go to that input.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    otpInput as otpInputPrimitive,
    type OTPInputOptions,
    type OTPInputState,
    type OTPInputValueChangeReason,
  } from "@ui-sdk/core/otp-input"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { inputAttributes } from "./context"

  let {
    value = $bindable(),
    defaultValue,
    maxLength,
    pattern,
    inputMode,
    textAlign,
    autoComplete,
    disabled,
    readOnly,
    required,
    name,
    form,
    controller,
    debug,
    onValueChange,
    onValueCommit,
    children,
    ...rest
  }: PartProps<"div", OTPInputState> &
    Omit<OTPInputOptions, "value"> & {
      /** The code. Bind it with `bind:value` to control the input. */
      value?: string
    } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const otp = usePrimitive(otpInputPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    maxLength,
    pattern,
    inputMode,
    textAlign,
    autoComplete,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    required,
    name: name ?? field?.name(),
    form,
    controller,
    debug,
    onValueChange: (
      next: string,
      details: ChangeDetails<OTPInputValueChangeReason>
    ) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onValueCommit,
  }))
  provideInstance(otpInputPrimitive, otp)
  const root = useHandlePart(otp, "root")
  const control = useHandlePart(otp, "control")
  // The user's attributes, split between the root and the input. Everything
  // but the input's goes to the root, attachments too, which Svelte passes
  // under symbol keys.
  const split = $derived.by(() => {
    const own: Record<string | symbol, unknown> = { ...rest }
    const named: Record<string, unknown> = {}
    for (const key of inputAttributes) {
      if (!(key in own)) {
        continue
      }
      named[key] = own[key]
      delete own[key]
    }
    return { own, named }
  })
  const fieldControl = field?.control(
    () => split.named.id as string | undefined,
    () => rest["aria-describedby"]
  )
</script>

{#snippet content(state: OTPInputState)}
  {@render children?.(state)}
  <input
    {...fieldControl
      ? fieldControl(control.slot(split.named))
      : control.slot(split.named)}
  />
{/snippet}

<Part tag="div" part={root} props={{ ...split.own, children: content }} />
