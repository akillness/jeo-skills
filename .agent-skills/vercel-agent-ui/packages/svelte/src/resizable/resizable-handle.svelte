<!--
@component
The handle between two panels: a focusable separator to drag or move with keys.
@stable
-->
<script lang="ts">
  import {
    resizable,
    type ResizableHandleProps,
    type ResizableHandleState,
  } from "@ui-sdk/core/resizable"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    disabled,
    ...rest
  }: PartProps<"div", ResizableHandleState> & ResizableHandleProps = $props()

  const id = $props.id()
  const handle = usePart(resizable, "handle", () => ({ id, disabled }))
</script>

<Part tag="div" part={handle} props={rest} />
