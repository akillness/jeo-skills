<!--
@component
The area the image shows in. Give it a size; its padding keeps the image
off its edges. In a frame, a pointer pans the image and the wheel zooms it.
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

  const part = usePart(imageCropper, "viewport")
</script>

<Part tag="div" {part} {props} />
