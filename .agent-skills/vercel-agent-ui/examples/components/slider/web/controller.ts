import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="mute">Mute</button>
        <button type="button" data-action="louder">Louder</button>
        <button type="button" data-action="read">Read</button>
        <button type="button" data-action="focus">Focus</button>
      </div>
      <ui-field>
        <ui-slider default-value="40">
          <div data-slot="row">
            <ui-field-label>Volume</ui-field-label>
            <ui-slider-value></ui-slider-value>
          </div>
          <ui-slider-control>
            <ui-slider-track>
              <ui-slider-indicator></ui-slider-indicator>
              <ui-slider-thumb></ui-slider-thumb>
            </ui-slider-track>
          </ui-slider-control>
        </ui-slider>
      </ui-field>
    </div>
  `
  const slider = root.querySelector("ui-slider")!
  const volume = slider.api
  const actions: Record<string, () => void> = {
    mute: () => volume.setValue(0),
    louder: () => volume.setValue(Number(volume.getValue()) + 10),
    read: () => log(root, `Volume is ${volume.getValue()}`),
    focus: () => volume.focus(),
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => actions[button.dataset.action!]())
    })
  slider.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(root, `Volume ${value} (${reason})`)
  })
}

export { mount }
