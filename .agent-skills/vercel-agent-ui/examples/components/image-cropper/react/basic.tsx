"use client"

import * as React from "react"
import { cropImage } from "@ui-sdk/react/image"
import {
  ImageCropper,
  ImageCropperGrid,
  ImageCropperHandle,
  ImageCropperImage,
  ImageCropperSelection,
  ImageCropperViewport,
  type ImageCrop,
} from "@ui-sdk/react/image-cropper"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

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

function Example() {
  const [ratio, setRatio] = React.useState<string | null>("free")
  const [crop, setCrop] = React.useState<ImageCrop>()
  const [result, setResult] = React.useState<string>()

  React.useEffect(
    () => () => {
      if (result) {
        URL.revokeObjectURL(result)
      }
    },
    [result]
  )

  async function save() {
    if (!crop) {
      return
    }
    const file = await cropImage(photo, crop)
    setResult(URL.createObjectURL(file))
  }

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select value={ratio} onValueChange={setRatio}>
          <SelectTrigger aria-label="Aspect ratio">
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {ratios.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="button" data-variant="solid" onClick={save}>
          Crop
        </button>
      </div>
      <ImageCropper
        aria-label="Photo"
        src={photo}
        aspectRatio={ratios.find((item) => item.value === ratio)?.ratio}
        minWidth={64}
        minHeight={64}
        crop={crop}
        onCropChange={setCrop}
      >
        <ImageCropperViewport>
          <ImageCropperImage alt="Mountains at sunset" />
          <ImageCropperSelection>
            <ImageCropperGrid />
          </ImageCropperSelection>
          {handles.map((position) => (
            <ImageCropperHandle key={position} position={position} />
          ))}
        </ImageCropperViewport>
      </ImageCropper>
      <div data-slot="image-cropper-result">
        {result && <img src={result} alt="Your crop" />}
      </div>
    </div>
  )
}

export { Example }
