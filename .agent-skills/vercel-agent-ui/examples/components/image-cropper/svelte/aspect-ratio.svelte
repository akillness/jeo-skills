<script lang="ts">
  import {
    ImageCropper,
    ImageCropperFlip,
    ImageCropperGrid,
    ImageCropperHandle,
    ImageCropperImage,
    ImageCropperSelection,
    ImageCropperViewport,
  } from "@ui-sdk/svelte/image-cropper"

  const photo = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#e5e5e5"/><circle cx="460" cy="150" r="56" fill="#fafafa"/><path d="M0 280 120 170l110 100 120-130 130 125 90-60 70 40v175H0z" fill="#a3a3a3"/><path d="M0 330l160-80 120 70 150-80 210 85v95H0z" fill="#525252"/><path d="M0 380q160-35 320-10t320-5v55H0z" fill="#262626"/></svg>`
  )}`

  const ratios = [
    { label: "Free", value: undefined },
    { label: "Square", value: 1 },
    { label: "Wide", value: 16 / 9 },
  ]

  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const

  let aspectRatio = $state<number>()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    {#each ratios as ratio (ratio.label)}
      <button
        type="button"
        aria-pressed={aspectRatio === ratio.value}
        onclick={() => (aspectRatio = ratio.value)}
      >
        {ratio.label}
      </button>
    {/each}
  </div>
  <ImageCropper
    aria-label="Photo"
    src={photo}
    {aspectRatio}
    minWidth={64}
    minHeight={64}
  >
    <ImageCropperViewport>
      <ImageCropperImage alt="Mountains at sunset" />
      <ImageCropperSelection>
        <ImageCropperGrid />
      </ImageCropperSelection>
      {#each handles as position (position)}
        <ImageCropperHandle {position} />
      {/each}
    </ImageCropperViewport>
    <div data-slot="row">
      <ImageCropperFlip>Flip</ImageCropperFlip>
      <ImageCropperFlip direction="vertical">Flip Vertically</ImageCropperFlip>
    </div>
  </ImageCropper>
</div>
