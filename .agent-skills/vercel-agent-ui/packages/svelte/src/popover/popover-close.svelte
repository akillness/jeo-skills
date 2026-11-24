<!--
@component
A button that closes the popover.
@stable
-->
<script lang="ts">
  import { popover } from "@ui-sdk/core/popover"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"button"> = $props()

  const close = usePart(popover, "close")
</script>

<Part tag="button" part={close} {props} />
