import "@ui-sdk/web/dialog"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-dialog>
        <ui-dialog-trigger><button>تعديل الملف الشخصي</button></ui-dialog-trigger>
        <ui-dialog-backdrop hidden></ui-dialog-backdrop>
        <ui-dialog-content hidden>
          <div data-slot="stack">
            <ui-dialog-title>تعديل الملف الشخصي</ui-dialog-title>
            <ui-dialog-description>أجرِ التغييرات على ملفك الشخصي هنا.</ui-dialog-description>
          </div>
          <label data-slot="label">
            الاسم
            <input value="بيدرو دوارتي" />
          </label>
          <div data-slot="row">
            <ui-dialog-close><button>إلغاء</button></ui-dialog-close>
            <ui-dialog-close value="save"><button data-variant="solid">حفظ</button></ui-dialog-close>
          </div>
        </ui-dialog-content>
      </ui-dialog>
    </div>
  `
}
