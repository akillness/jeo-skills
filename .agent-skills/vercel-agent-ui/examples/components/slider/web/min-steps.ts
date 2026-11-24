import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

const time = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-slider
        default-value="540/1020"
        min="0"
        max="1440"
        step="15"
        min-steps-between-thumbs="16"
      >
        <div data-slot="row">
          <ui-field-label>Opening hours</ui-field-label>
          <ui-slider-value></ui-slider-value>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            <ui-slider-thumb aria-label="Opens"></ui-slider-thumb>
            <ui-slider-thumb aria-label="Closes"></ui-slider-thumb>
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
    </ui-field>
  `
  const slider = root.querySelector("ui-slider")!
  slider.format = time
}

export { mount }
