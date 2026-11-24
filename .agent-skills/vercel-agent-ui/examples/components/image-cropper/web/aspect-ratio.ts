import "@ui-sdk/web/image-cropper"

const photo = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#e5e5e5"/><circle cx="460" cy="150" r="56" fill="#fafafa"/><path d="M0 280 120 170l110 100 120-130 130 125 90-60 70 40v175H0z" fill="#a3a3a3"/><path d="M0 330l160-80 120 70 150-80 210 85v95H0z" fill="#525252"/><path d="M0 380q160-35 320-10t320-5v55H0z" fill="#262626"/></svg>`
)}`

const ratios = [
  { label: "Free", value: "" },
  { label: "Square", value: "1" },
  { label: "Wide", value: String(16 / 9) },
]

const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        ${ratios
          .map(
            (ratio) =>
              `<button type="button" aria-pressed="${ratio.value === ""}" data-ratio="${ratio.value}">${ratio.label}</button>`
          )
          .join("")}
      </div>
      <ui-image-cropper aria-label="Photo" src="${photo}" min-width="64" min-height="64">
        <ui-image-cropper-viewport>
          <ui-image-cropper-image><img alt="Mountains at sunset" /></ui-image-cropper-image>
          <ui-image-cropper-selection>
            <ui-image-cropper-grid></ui-image-cropper-grid>
          </ui-image-cropper-selection>
          ${handles.map((position) => `<ui-image-cropper-handle position="${position}"></ui-image-cropper-handle>`).join("")}
        </ui-image-cropper-viewport>
        <div data-slot="row">
          <ui-image-cropper-flip>Flip</ui-image-cropper-flip>
          <ui-image-cropper-flip direction="vertical">Flip Vertically</ui-image-cropper-flip>
        </div>
      </ui-image-cropper>
    </div>
  `
  const cropper = root.querySelector("ui-image-cropper")!
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-ratio]")
  for (const button of buttons) {
    button.addEventListener("click", () => {
      for (const other of buttons) {
        other.setAttribute("aria-pressed", String(other === button))
      }
      if (button.dataset.ratio) {
        cropper.setAttribute("aspect-ratio", button.dataset.ratio)
      } else {
        cropper.removeAttribute("aspect-ratio")
      }
    })
  }
}

export { mount }
