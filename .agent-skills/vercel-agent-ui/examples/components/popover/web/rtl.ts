import "@ui-sdk/web/popover"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-popover>
        <ui-popover-trigger><button>الأبعاد</button></ui-popover-trigger>
        <ui-popover-content align="start" side-offset="8">
          <ui-popover-arrow></ui-popover-arrow>
          <ui-popover-title>الأبعاد</ui-popover-title>
          <ui-popover-description>اضبط أبعاد الطبقة.</ui-popover-description>
        </ui-popover-content>
      </ui-popover>
    </div>
  `
}

export { mount }
