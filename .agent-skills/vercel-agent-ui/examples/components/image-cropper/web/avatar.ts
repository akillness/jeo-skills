import "@ui-sdk/web/image-cropper"
import { cropImage } from "@ui-sdk/web"

const photo = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#e5e5e5"/><circle cx="460" cy="150" r="56" fill="#fafafa"/><path d="M0 280 120 170l110 100 120-130 130 125 90-60 70 40v175H0z" fill="#a3a3a3"/><path d="M0 330l160-80 120 70 150-80 210 85v95H0z" fill="#525252"/><path d="M0 380q160-35 320-10t320-5v55H0z" fill="#262626"/></svg>`
)}`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-image-cropper aria-label="Profile photo" src="${photo}" mode="frame" aspect-ratio="1" shape="circle" max-zoom="4">
      <ui-image-cropper-viewport>
        <ui-image-cropper-image><img alt="Mountains at sunset" /></ui-image-cropper-image>
        <ui-image-cropper-selection></ui-image-cropper-selection>
      </ui-image-cropper-viewport>
      <div data-slot="row">
        <ui-image-cropper-zoom></ui-image-cropper-zoom>
        <ui-image-cropper-rotate>Rotate</ui-image-cropper-rotate>
      </div>
      <div data-slot="row">
        <button type="button">Save Avatar</button>
        <img data-slot="image-cropper-avatar" alt="Your new avatar" hidden />
      </div>
    </ui-image-cropper>
  `
  const cropper = root.querySelector("ui-image-cropper")!
  const avatar = root.querySelector<HTMLImageElement>(
    '[data-slot="image-cropper-avatar"]'
  )!
  root
    .querySelector("[data-slot=row] > button")!
    .addEventListener("click", async () => {
      if (!cropper.crop) {
        return
      }
      const file = await cropImage(photo, cropper.crop, {
        width: 128,
        shape: "circle",
      })
      if (avatar.src) {
        URL.revokeObjectURL(avatar.src)
      }
      avatar.src = URL.createObjectURL(file)
      avatar.hidden = false
    })
}

export { mount }
