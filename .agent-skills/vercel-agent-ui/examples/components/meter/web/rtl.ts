import "@ui-sdk/web/meter"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-meter value="68" locale="ar-EG">
        <ui-meter-label>مساحة التخزين</ui-meter-label>
        <ui-meter-value></ui-meter-value>
        <ui-meter-track>
          <ui-meter-indicator></ui-meter-indicator>
        </ui-meter-track>
      </ui-meter>
    </div>
  `
}

export { mount }
