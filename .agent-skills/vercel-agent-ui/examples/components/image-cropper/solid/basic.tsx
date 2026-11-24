import { createSignal, For, onCleanup, Show } from "solid-js"
import { cropImage } from "@ui-sdk/solid/image"
import {
  ImageCropper,
  ImageCropperGrid,
  ImageCropperHandle,
  ImageCropperImage,
  ImageCropperSelection,
  ImageCropperViewport,
  type ImageCrop,
} from "@ui-sdk/solid/image-cropper"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"

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
  const [ratio, setRatio] = createSignal<string | null>("free")
  const [crop, setCrop] = createSignal<ImageCrop>()
  const [result, setResult] = createSignal<string>()

  async function save() {
    const current = crop()
    if (!current) {
      return
    }
    const file = await cropImage(photo, current)
    const previous = result()
    if (previous) {
      URL.revokeObjectURL(previous)
    }
    setResult(URL.createObjectURL(file))
  }

  onCleanup(() => {
    const current = result()
    if (current) {
      URL.revokeObjectURL(current)
    }
  })

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select value={ratio()} onValueChange={setRatio}>
          <SelectTrigger aria-label="Aspect ratio">
            <SelectValue />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </SelectTrigger>
          <SelectContent>
            <For each={ratios}>
              {(item) => (
                <SelectItem value={item.value}>
                  {item.label}
                  <SelectItemIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </SelectItemIndicator>
                </SelectItem>
              )}
            </For>
          </SelectContent>
        </Select>
        <button type="button" data-variant="solid" onClick={save}>
          Crop
        </button>
      </div>
      <ImageCropper
        aria-label="Photo"
        src={photo}
        aspectRatio={ratios.find((item) => item.value === ratio())?.ratio}
        minWidth={64}
        minHeight={64}
        crop={crop()}
        onCropChange={setCrop}
      >
        <ImageCropperViewport>
          <ImageCropperImage alt="Mountains at sunset" />
          <ImageCropperSelection>
            <ImageCropperGrid />
          </ImageCropperSelection>
          <For each={handles}>
            {(position) => <ImageCropperHandle position={position} />}
          </For>
        </ImageCropperViewport>
      </ImageCropper>
      <div data-slot="image-cropper-result">
        <Show when={result()}>
          {(src) => <img src={src()} alt="Your crop" />}
        </Show>
      </div>
    </div>
  )
}

export { Example }
