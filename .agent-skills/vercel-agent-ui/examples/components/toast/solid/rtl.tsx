import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/solid/toast"

const toast = createToaster()

export function Example() {
  return (
    <div dir="rtl">
      <button
        onClick={() =>
          toast("تم إنشاء الحدث", {
            description: "الأحد 3 ديسمبر الساعة 9:00 صباحًا",
          })
        }
      >
        إظهار الإشعار
      </button>
      <ToastRegion toaster={toast}>
        {(item) => (
          <Toast>
            <div data-slot="stack">
              <ToastTitle />
              <ToastDescription />
            </div>
          </Toast>
        )}
      </ToastRegion>
    </div>
  )
}
