import { Separator } from "@ui-sdk/react/separator"

function Example() {
  return (
    <div data-slot="stack" dir="rtl">
      <div data-slot="stack">
        <h3>الحساب</h3>
        <p data-slot="hint">إدارة ملفك الشخصي وتفضيلاتك.</p>
      </div>
      <Separator />
      <div data-slot="row">
        <span>الملف الشخصي</span>
        <Separator orientation="vertical" />
        <span>الفوترة</span>
        <Separator orientation="vertical" />
        <span>الإعدادات</span>
      </div>
    </div>
  )
}

export { Example }
