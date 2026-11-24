import "@ui-sdk/web/alert-dialog"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
    <ui-alert-dialog>
      <ui-alert-dialog-trigger><button>حذف الحساب</button></ui-alert-dialog-trigger>
      <ui-alert-dialog-backdrop></ui-alert-dialog-backdrop>
      <ui-alert-dialog-content>
        <div data-slot="stack">
          <ui-alert-dialog-title>هل أنت متأكد تمامًا؟</ui-alert-dialog-title>
          <ui-alert-dialog-description>لا يمكن التراجع عن هذا الإجراء. سيؤدي إلى حذف حسابك نهائيًا.</ui-alert-dialog-description>
        </div>
        <div data-slot="row">
          <ui-alert-dialog-close><button>إلغاء</button></ui-alert-dialog-close>
          <ui-alert-dialog-close value="confirm"><button data-variant="solid">متابعة</button></ui-alert-dialog-close>
        </div>
      </ui-alert-dialog-content>
    </ui-alert-dialog>
    </div>
  `
}
