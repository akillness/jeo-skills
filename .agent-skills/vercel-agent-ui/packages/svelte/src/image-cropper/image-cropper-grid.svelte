<!--
@component
Lines across the selection in thirds, for CSS to draw, with `data-dragging` during a drag.
@experimental
-->
<script lang="ts">
  import {
    imageCropper,
    type ImageCropperState,
  } from "@ui-sdk/core/image-cropper"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ImageCropperState> = $props()

  const part = usePart(imageCropper, "grid")
</script>

<Part tag="div" {part} {props} />
