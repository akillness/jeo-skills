<!--
@component
A button that closes the drawer. An `action` runs first, and a Promise it returns keeps the drawer open
until it settles.
@stable
-->
<script lang="ts">
  import type { DialogCloseProps, DialogCloseState } from "@ui-sdk/core/dialog"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useDrawer } from "./context"

  let {
    value,
    action,
    ...rest
  }: PartProps<"button", DialogCloseState> & DialogCloseProps = $props()

  // Keyed by its own id, so several Close parts stay apart.
  const id = $props.id()
  const close = useHandlePart(useDrawer().handle, "close", () => ({
    id,
    value,
    action,
  }))
</script>

<Part tag="button" part={close} props={rest} />
