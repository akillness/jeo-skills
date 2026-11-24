<!--
@component
A button that turns the image a quarter clockwise.
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

  let props: PartProps<"button", ImageCropperState> = $props()

  const part = usePart(imageCropper, "rotate")
</script>

<Part tag="button" {part} {props} />
