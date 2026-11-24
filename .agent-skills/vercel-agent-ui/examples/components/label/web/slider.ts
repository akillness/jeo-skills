import "@ui-sdk/web/label"
import "@ui-sdk/web/slider"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-slider id="volume" default-value="75">
      <div data-slot="row">
        <ui-label for="volume">Volume</ui-label>
        <ui-slider-value></ui-slider-value>
      </div>
      <ui-slider-control>
        <ui-slider-track>
          <ui-slider-indicator></ui-slider-indicator>
          <ui-slider-thumb></ui-slider-thumb>
        </ui-slider-track>
      </ui-slider-control>
    </ui-slider>
  `
}

export { mount }
