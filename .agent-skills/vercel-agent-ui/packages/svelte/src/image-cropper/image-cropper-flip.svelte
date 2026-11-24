<!--
@component
A button that mirrors the image, left to right or, with `direction="vertical"`, top to bottom.
@experimental
-->
<script lang="ts">
  import {
    imageCropper,
    type ImageCropperFlipProps,
    type ImageCropperState,
  } from "@ui-sdk/core/image-cropper"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    direction,
    ...rest
  }: PartProps<"button", ImageCropperState> & ImageCropperFlipProps = $props()

  const id = $props.id()
  const flip = usePart(imageCropper, "flip", () => ({ id, direction }))
</script>

<Part tag="button" part={flip} props={rest} />
