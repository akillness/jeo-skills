import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

const ticks = (count: number) =>
  `<div data-slot="ticks" aria-hidden="true">${"<span></span>".repeat(count)}</div>`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-slider default-value="2010" min="1990" max="2030" step="5">
          <div data-slot="row">
            <ui-field-label>Year</ui-field-label>
            <ui-slider-value></ui-slider-value>
          </div>
          <ui-slider-control>
            <ui-slider-track>
              <ui-slider-indicator></ui-slider-indicator>
              <ui-slider-thumb></ui-slider-thumb>
            </ui-slider-track>
          </ui-slider-control>
          ${ticks(9)}
        </ui-slider>
      </ui-field>
      <ui-field>
        <ui-slider default-value="0.5" min="0" max="1" step="0.05">
          <div data-slot="row">
            <ui-field-label>Opacity</ui-field-label>
            <ui-slider-value></ui-slider-value>
          </div>
          <ui-slider-control>
            <ui-slider-track>
              <ui-slider-indicator></ui-slider-indicator>
              <ui-slider-thumb></ui-slider-thumb>
            </ui-slider-track>
          </ui-slider-control>
          ${ticks(21)}
        </ui-slider>
      </ui-field>
    </div>
  `
  root.querySelector("ui-slider")!.format = { useGrouping: false }
}

export { mount }
