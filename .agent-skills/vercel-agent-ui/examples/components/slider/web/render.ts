import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-slider default-value="60">
        <div data-slot="row">
          <ui-field-label>Brightness</ui-field-label>
          <ui-slider-value>60%</ui-slider-value>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            <ui-slider-thumb><span data-slot="output">60</span></ui-slider-thumb>
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
    </ui-field>
  `
  const slider = root.querySelector("ui-slider")!
  const text = root.querySelector("ui-slider-value")!
  const output = root.querySelector('[data-slot="output"]')!
  slider.addEventListener("valuechange", (event) => {
    text.textContent = `${event.detail.value}%`
    output.textContent = String(event.detail.value)
  })
}

export { mount }
