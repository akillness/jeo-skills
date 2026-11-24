<script lang="ts">
  import {
    ImageCropper,
    ImageCropperImage,
    ImageCropperSelection,
    ImageCropperViewport,
  } from "../../src/image-cropper"

  let crop = $state({ x: 10, y: 10, width: 100, height: 100 })
  let disabled = $state(false)

  export function toggle() {
    disabled = !disabled
  }
</script>

<ImageCropper aria-label="Photo" src="photo.png" bind:crop {disabled}>
  <ImageCropperViewport>
    <ImageCropperImage alt="" />
    <ImageCropperSelection />
  </ImageCropperViewport>
</ImageCropper>
