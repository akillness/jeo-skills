import "@ui-sdk/web/separator"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack" dir="rtl">
      <div data-slot="stack">
        <h3>الحساب</h3>
        <p data-slot="hint">إدارة ملفك الشخصي وتفضيلاتك.</p>
      </div>
      <ui-separator></ui-separator>
      <div data-slot="row">
        <span>الملف الشخصي</span>
        <ui-separator orientation="vertical"></ui-separator>
        <span>الفوترة</span>
        <ui-separator orientation="vertical"></ui-separator>
        <span>الإعدادات</span>
      </div>
    </div>
  `
}

export { mount }
