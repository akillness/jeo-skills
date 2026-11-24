import "@ui-sdk/web/slider"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl" data-slot="stack">
      <ui-slider default-value="20/60" locale="ar-EG" aria-label="نطاق السعر">
        <div data-slot="row">
          <span data-slot="label">نطاق السعر</span>
          <ui-slider-value></ui-slider-value>
        </div>
        <ui-slider-control>
          <ui-slider-track>
            <ui-slider-indicator></ui-slider-indicator>
            <ui-slider-thumb aria-label="الحد الأدنى"></ui-slider-thumb>
            <ui-slider-thumb aria-label="الحد الأقصى"></ui-slider-thumb>
          </ui-slider-track>
        </ui-slider-control>
      </ui-slider>
    </div>
  `
}

export { mount }
