import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"

const toast = createToaster()

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <button>إظهار الإشعار</button>
      <ui-toast-region>
        <template>
          <ui-toast>
            <div data-slot="stack">
              <ui-toast-title></ui-toast-title>
              <ui-toast-description></ui-toast-description>
            </div>
          </ui-toast>
        </template>
      </ui-toast-region>
    </div>
  `
  Object.assign(root.querySelector("ui-toast-region")!, {
    toaster: toast,
  })
  root.querySelector("button")!.addEventListener("click", () =>
    toast("تم إنشاء الحدث", {
      description: "الأحد 3 ديسمبر الساعة 9:00 صباحًا",
    })
  )
}
