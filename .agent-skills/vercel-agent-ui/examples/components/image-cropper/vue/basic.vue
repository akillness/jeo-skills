<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { cropImage } from "@ui-sdk/vue/image"
import {
  ImageCropper,
  ImageCropperGrid,
  ImageCropperHandle,
  ImageCropperImage,
  ImageCropperSelection,
  ImageCropperViewport,
  type ImageCrop,
} from "@ui-sdk/vue/image-cropper"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { computed, onBeforeUnmount, ref } from "vue"

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

const ratio = ref<string | null>("free")
const aspectRatio = computed(
  () => ratios.find((item) => item.value === ratio.value)?.ratio
)
const crop = ref<ImageCrop>()
const result = ref<string>()

async function save() {
  if (!crop.value) {
    return
  }
  const file = await cropImage(photo, crop.value)
  if (result.value) {
    URL.revokeObjectURL(result.value)
  }
  result.value = URL.createObjectURL(file)
}

onBeforeUnmount(() => result.value && URL.revokeObjectURL(result.value))
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <Select v-model:value="ratio">
        <SelectTrigger aria-label="Aspect ratio">
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="item in ratios"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
      <button type="button" data-variant="solid" @click="save">Crop</button>
    </div>
    <ImageCropper
      v-model:crop="crop"
      aria-label="Photo"
      :src="photo"
      :aspect-ratio="aspectRatio"
      :min-width="64"
      :min-height="64"
    >
      <ImageCropperViewport>
        <ImageCropperImage alt="Mountains at sunset" />
        <ImageCropperSelection>
          <ImageCropperGrid />
        </ImageCropperSelection>
        <ImageCropperHandle
          v-for="position in handles"
          :key="position"
          :position="position"
        />
      </ImageCropperViewport>
    </ImageCropper>
    <div data-slot="image-cropper-result">
      <img v-if="result" :src="result" alt="Your crop" />
    </div>
  </div>
</template>
