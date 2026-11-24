import "@ui-sdk/web/image-cropper"
import "@ui-sdk/web/select"
import { cropImage } from "@ui-sdk/web"
import { Check, ChevronDown, createElement } from "lucide"

const photo = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#e5e5e5"/><circle cx="460" cy="150" r="56" fill="#fafafa"/><path d="M0 280 120 170l110 100 120-130 130 125 90-60 70 40v175H0z" fill="#a3a3a3"/><path d="M0 330l160-80 120 70 150-80 210 85v95H0z" fill="#525252"/><path d="M0 380q160-35 320-10t320-5v55H0z" fill="#262626"/></svg>`
)}`

const ratios = [
  { value: "free", label: "Free", ratio: undefined },
  { value: "square", label: "Square", ratio: 1 },
  { value: "landscape", label: "4:3", ratio: 4 / 3 },
  { value: "wide", label: "16:9", ratio: 16 / 9 },
]

const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <ui-select default-value="free">
          <ui-select-trigger>
            <button aria-label="Aspect ratio">
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${ratios
              .map(
                (item) => `
                  <ui-select-item value="${item.value}">
                    ${item.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
        <button type="button" data-variant="solid">Crop</button>
      </div>
      <ui-image-cropper aria-label="Photo" src="${photo}" min-width="64" min-height="64">
        <ui-image-cropper-viewport>
          <ui-image-cropper-image><img alt="Mountains at sunset" /></ui-image-cropper-image>
          <ui-image-cropper-selection>
            <ui-image-cropper-grid></ui-image-cropper-grid>
          </ui-image-cropper-selection>
          ${handles.map((position) => `<ui-image-cropper-handle position="${position}"></ui-image-cropper-handle>`).join("")}
        </ui-image-cropper-viewport>
      </ui-image-cropper>
      <div data-slot="image-cropper-result">
        <img alt="Your crop" hidden />
      </div>
    </div>
  `
  const cropper = root.querySelector("ui-image-cropper")!
  const result = root.querySelector<HTMLImageElement>(
    '[data-slot="image-cropper-result"] > img'
  )!
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    const ratio = ratios.find(
      (item) => item.value === event.detail.value
    )?.ratio
    if (ratio) {
      cropper.setAttribute("aspect-ratio", String(ratio))
    } else {
      cropper.removeAttribute("aspect-ratio")
    }
  })
  root
    .querySelector("[data-slot=controls] > button")!
    .addEventListener("click", async () => {
      if (!cropper.crop) {
        return
      }
      const file = await cropImage(photo, cropper.crop)
      if (result.src) {
        URL.revokeObjectURL(result.src)
      }
      result.src = URL.createObjectURL(file)
      result.hidden = false
    })
}

export { mount }
