<!--
@component
A range input for the zoom, from 1 to `maxZoom`.
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

  let props: PartProps<"input", ImageCropperState> = $props()

  const part = usePart(imageCropper, "zoom")
</script>

<Part tag="input" {part} {props} />
