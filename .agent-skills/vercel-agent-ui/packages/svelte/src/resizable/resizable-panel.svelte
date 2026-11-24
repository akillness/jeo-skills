<!--
@component
A panel. Its size is written to `--resizable-panel-size` on every frame of a
drag, so it never renders for a resize unless its snippet reads `size`.
@stable
-->
<script lang="ts">
  import {
    resizable,
    type ResizablePanelProps,
    type ResizablePanelState,
  } from "@ui-sdk/core/resizable"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    id,
    defaultSize,
    minSize,
    maxSize,
    collapsible,
    collapsedSize,
    ...rest
  }: PartProps<"div", ResizablePanelState> & ResizablePanelProps = $props()

  const generated = $props.id()
  const panel = usePart(resizable, "panel", () => ({
    id: id ?? generated,
    defaultSize,
    minSize,
    maxSize,
    collapsible,
    collapsedSize,
  }))
</script>

<Part tag="div" part={panel} props={rest} />
