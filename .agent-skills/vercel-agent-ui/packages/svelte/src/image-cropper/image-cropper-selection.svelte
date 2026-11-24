<!--
@component
The crop. A pointer drags it in a box; arrows move it, plus and minus
zoom, and R turns the image.
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

  const part = usePart(imageCropper, "selection")
</script>

<Part tag="div" {part} {props} />
