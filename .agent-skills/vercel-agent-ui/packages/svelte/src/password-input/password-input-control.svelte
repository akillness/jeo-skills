<!--
@component
The native <input>. Its type follows whether the password is shown, and
form attributes come from <PasswordInput>.
@stable
-->
<script lang="ts">
  import type { PasswordInputState } from "@ui-sdk/core/password-input"
  import NativeInput from "../native-input.svelte"
  import type { TextPartProps } from "../text-control"
  import { useHandlePart } from "../use-primitive.svelte"
  import { usePasswordInput } from "./context"

  let {
    id,
    render,
    children,
    ...rest
  }: TextPartProps<"input", PasswordInputState> = $props()

  const passwordInput = usePasswordInput("PasswordInputControl")
  const control = useHandlePart(passwordInput, "control", () => ({
    id: id ?? undefined,
  }))
  const field = passwordInput.field?.control(
    () => control.attrs.id as string | undefined,
    () => rest["aria-describedby"]
  )
  // A controlled value is the DOM property, which the spread writes on every
  // change. A default is the `value` attribute, which a form reset returns to,
  // and which the server renders.
  const element = () => {
    const value = passwordInput.value()
    return {
      ...rest,
      ...(value !== undefined
        ? { value }
        : { defaultValue: passwordInput.defaultValue() }),
    }
  }
</script>

<NativeInput
  {render}
  {children}
  props={field ? field(control.slot(element())) : control.slot(element())}
  state={control.state}
/>
