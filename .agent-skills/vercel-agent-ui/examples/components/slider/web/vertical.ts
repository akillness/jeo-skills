import "@ui-sdk/web/slider"
import "@ui-sdk/web/field"

const channels = [
  { label: "Bass", value: 50 },
  { label: "Treble", value: 25 },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      ${channels
        .map(
          (channel) => `
            <ui-field>
              <ui-slider orientation="vertical" default-value="${channel.value}">
                <ui-slider-control>
                  <ui-slider-track>
                    <ui-slider-indicator></ui-slider-indicator>
                    <ui-slider-thumb></ui-slider-thumb>
                  </ui-slider-track>
                </ui-slider-control>
              </ui-slider>
              <ui-field-label>${channel.label}</ui-field-label>
            </ui-field>
          `
        )
        .join("")}
    </div>
  `
}

export { mount }
