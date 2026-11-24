import "@ui-sdk/web/resizable"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-resizable>
        <ui-resizable-panel default-size="35" min-size="20">
          <h3>الملفات</h3>
          <ul>
            <li>page.tsx</li>
            <li>layout.tsx</li>
            <li>globals.css</li>
          </ul>
        </ui-resizable-panel>
        <ui-resizable-handle aria-label="تغيير حجم الملفات"></ui-resizable-handle>
        <ui-resizable-panel default-size="65" min-size="40">
          <ui-resizable orientation="vertical">
            <ui-resizable-panel default-size="60" min-size="30">
              <h3>page.tsx</h3>
              <span data-slot="hint">حُفظ للتو</span>
            </ui-resizable-panel>
            <ui-resizable-handle aria-label="تغيير حجم المحرر"></ui-resizable-handle>
            <ui-resizable-panel default-size="40" min-size="30">
              <h3>الطرفية</h3>
              <span data-slot="hint">جاهز على المنفذ 3000</span>
            </ui-resizable-panel>
          </ui-resizable>
        </ui-resizable-panel>
      </ui-resizable>
    </div>
  `
}

export { mount }
