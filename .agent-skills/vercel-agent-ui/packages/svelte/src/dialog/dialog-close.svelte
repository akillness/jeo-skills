<!--
@component
A button that closes the dialog. An `action` runs first, and a Promise it returns keeps the dialog open
until it settles.
@stable
-->
<script lang="ts">
  import type { DialogCloseProps, DialogCloseState } from "@ui-sdk/core/dialog"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDialog } from "./context"

  let {
    value,
    action,
    ...rest
  }: PartProps<"button", DialogCloseState> & DialogCloseProps = $props()

  // Keyed by its own id, so several Close parts stay apart.
  const id = $props.id()
  const close = useHandlePart(useDialog().handle, "close", () => ({
    id,
    value,
    action,
  }))
</script>

<Part tag="button" part={close} props={rest} />
