import "@ui-sdk/web/switch"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <label data-slot="label">
        وضع الطيران
        <ui-switch>
          <ui-switch-thumb></ui-switch-thumb>
        </ui-switch>
      </label>
    </div>
  `
}

export { mount }
