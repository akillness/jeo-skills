<!--
@component
An edge or corner of the selection, by its `position`, that resizes it in a box.
@experimental
-->
<script lang="ts">
  import {
    imageCropper,
    type ImageCropperHandleProps,
    type ImageCropperHandleState,
  } from "@ui-sdk/core/image-cropper"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    position,
    ...rest
  }: PartProps<"div", ImageCropperHandleState> & ImageCropperHandleProps =
    $props()

  const id = $props.id()
  const handle = usePart(imageCropper, "handle", () => ({ id, position }))
</script>

<Part tag="div" part={handle} props={rest} />
