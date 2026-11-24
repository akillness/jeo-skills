import "@ui-sdk/web/tabs"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-tabs default-value="account">
        <ui-tabs-list aria-label="الإعدادات">
          <ui-tabs-tab value="account">
            <button>الحساب</button>
          </ui-tabs-tab>
          <ui-tabs-tab value="password">
            <button>كلمة المرور</button>
          </ui-tabs-tab>
          <ui-tabs-tab value="notifications">
            <button>الإشعارات</button>
          </ui-tabs-tab>
          <ui-tabs-indicator></ui-tabs-indicator>
        </ui-tabs-list>
        <ui-tabs-panel value="account">عدّل اسمك وبريدك الإلكتروني وصورتك.</ui-tabs-panel>
        <ui-tabs-panel value="password">غيّر كلمة المرور وفعّل التحقق بخطوتين.</ui-tabs-panel>
        <ui-tabs-panel value="notifications">اختر ما نرسله إليك بالبريد.</ui-tabs-panel>
      </ui-tabs>
    </div>
  `
}
