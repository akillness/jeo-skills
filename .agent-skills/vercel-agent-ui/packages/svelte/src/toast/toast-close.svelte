<!--
@component
Closes the toast. With an `action`, runs it first, and a returned Promise keeps the toast open until it
settles.
@stable
-->
<script lang="ts">
  import type { ToastButtonState, ToastCloseProps } from "@ui-sdk/core/toast"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useToast } from "./context"

  /** Closes the toast. With an `action`, runs it first, and a returned Promise keeps the toast open until it settles. */
  let {
    action,
    ...rest
  }: PartProps<"button", ToastButtonState> & ToastCloseProps = $props()

  const { region, toast } = useToast("ToastClose")
  const id = $props.id()
  const close = useHandlePart(region, "close", () => ({
    id,
    toast: toast().id,
    action,
  }))
</script>

<Part tag="button" part={close} props={{ type: "button", ...rest }} />
