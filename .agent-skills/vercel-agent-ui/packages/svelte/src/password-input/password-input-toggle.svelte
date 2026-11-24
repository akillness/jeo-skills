<!--
@component
Shows and hides the password. Name it by what it does, like "Show password":
it's a toggle button, and `aria-pressed` says whether the password is shown.
@stable
-->
<script lang="ts">
  import type { PasswordInputState } from "@ui-sdk/core/password-input"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { usePasswordInput } from "./context"

  let props: PartProps<"button", PasswordInputState> = $props()

  const toggle = useHandlePart(
    usePasswordInput("PasswordInputToggle"),
    "toggle"
  )
</script>

<Part tag="button" part={toggle} {props} />
