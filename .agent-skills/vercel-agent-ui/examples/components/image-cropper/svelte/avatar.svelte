<script lang="ts">
  import { onDestroy } from "svelte"
  import { cropImage } from "@ui-sdk/svelte/image"
  import {
    ImageCropper,
    ImageCropperImage,
    ImageCropperRotate,
    ImageCropperSelection,
    ImageCropperViewport,
    ImageCropperZoom,
    type ImageCrop,
  } from "@ui-sdk/svelte/image-cropper"

  const photo = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#e5e5e5"/><circle cx="460" cy="150" r="56" fill="#fafafa"/><path d="M0 280 120 170l110 100 120-130 130 125 90-60 70 40v175H0z" fill="#a3a3a3"/><path d="M0 330l160-80 120 70 150-80 210 85v95H0z" fill="#525252"/><path d="M0 380q160-35 320-10t320-5v55H0z" fill="#262626"/></svg>`
  )}`

  let crop = $state<ImageCrop>()
  let avatar = $state<string>()

  async function save() {
    if (!crop) {
      return
    }
    const file = await cropImage(photo, crop, { width: 128, shape: "circle" })
    if (avatar) {
      URL.revokeObjectURL(avatar)
    }
    avatar = URL.createObjectURL(file)
  }

  onDestroy(() => avatar && URL.revokeObjectURL(avatar))
</script>

<ImageCropper
  bind:crop
  aria-label="Profile photo"
  src={photo}
  mode="frame"
  aspectRatio={1}
  shape="circle"
  maxZoom={4}
>
  <ImageCropperViewport>
    <ImageCropperImage alt="Mountains at sunset" />
    <ImageCropperSelection />
  </ImageCropperViewport>
  <div data-slot="row">
    <ImageCropperZoom />
    <ImageCropperRotate>Rotate</ImageCropperRotate>
  </div>
  <div data-slot="row">
    <button type="button" onclick={save}>Save Avatar</button>
    {#if avatar}
      <img
        data-slot="image-cropper-avatar"
        src={avatar}
        alt="Your new avatar"
      />
    {/if}
  </div>
</ImageCropper>
