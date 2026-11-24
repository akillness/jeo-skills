<script lang="ts">
  import { onDestroy } from "svelte"
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { cropImage } from "@ui-sdk/svelte/image"
  import {
    ImageCropper,
    ImageCropperGrid,
    ImageCropperHandle,
    ImageCropperImage,
    ImageCropperSelection,
    ImageCropperViewport,
    type ImageCrop,
  } from "@ui-sdk/svelte/image-cropper"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const photo = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#e5e5e5"/><circle cx="460" cy="150" r="56" fill="#fafafa"/><path d="M0 280 120 170l110 100 120-130 130 125 90-60 70 40v175H0z" fill="#a3a3a3"/><path d="M0 330l160-80 120 70 150-80 210 85v95H0z" fill="#525252"/><path d="M0 380q160-35 320-10t320-5v55H0z" fill="#262626"/></svg>`
  )}`

  const ratios = [
    { value: "free", label: "Free", ratio: undefined },
    { value: "square", label: "Square", ratio: 1 },
    { value: "landscape", label: "4:3", ratio: 4 / 3 },
    { value: "wide", label: "16:9", ratio: 16 / 9 },
  ]

  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const

  let ratio = $state<string | null>("free")
  let crop = $state<ImageCrop>()
  let result = $state<string>()

  async function save() {
    if (!crop) {
      return
    }
    const file = await cropImage(photo, crop)
    if (result) {
      URL.revokeObjectURL(result)
    }
    result = URL.createObjectURL(file)
  }

  onDestroy(() => result && URL.revokeObjectURL(result))
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <Select bind:value={ratio}>
      <SelectTrigger aria-label="Aspect ratio">
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each ratios as item (item.value)}
          <SelectItem value={item.value}>
            {item.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <button type="button" data-variant="solid" onclick={save}>Crop</button>
  </div>
  <ImageCropper
    bind:crop
    aria-label="Photo"
    src={photo}
    aspectRatio={ratios.find((item) => item.value === ratio)?.ratio}
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
  </ImageCropper>
  <div data-slot="image-cropper-result">
    {#if result}
      <img src={result} alt="Your crop" />
    {/if}
  </div>
</div>
