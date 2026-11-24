<!--
@component
The image, from the root's `src`, turned and flipped. Give it an `alt`.
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

  let props: PartProps<"img", ImageCropperState> = $props()

  const part = usePart(imageCropper, "image")
</script>

<Part tag="img" {part} {props} />
