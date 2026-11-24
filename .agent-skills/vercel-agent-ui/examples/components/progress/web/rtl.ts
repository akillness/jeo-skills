import "@ui-sdk/web/progress"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-progress value="56" locale="ar-EG">
        <ui-progress-label>تقدم الرفع</ui-progress-label>
        <ui-progress-value></ui-progress-value>
        <ui-progress-track>
          <ui-progress-indicator></ui-progress-indicator>
        </ui-progress-track>
      </ui-progress>
    </div>
  `
}

export { mount }
