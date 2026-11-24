import "@ui-sdk/web/menubar"
import "@ui-sdk/web/menu"
import { ChevronRight, createElement } from "lucide"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-menubar>
        <ui-menu>
          <ui-menu-trigger>
            <button>ملف</button>
          </ui-menu-trigger>
          <ui-menu-content>
            <ui-menu-item>علامة تبويب جديدة</ui-menu-item>
            <ui-menu-sub>
              <ui-menu-sub-trigger>
                مشاركة
                ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
              </ui-menu-sub-trigger>
              <ui-menu-sub-content>
                <ui-menu-item>البريد الإلكتروني</ui-menu-item>
                <ui-menu-item>الرسائل</ui-menu-item>
              </ui-menu-sub-content>
            </ui-menu-sub>
          </ui-menu-content>
        </ui-menu>
        <ui-menu>
          <ui-menu-trigger>
            <button>تحرير</button>
          </ui-menu-trigger>
          <ui-menu-content>
            <ui-menu-item>تراجع</ui-menu-item>
            <ui-menu-item>إعادة</ui-menu-item>
          </ui-menu-content>
        </ui-menu>
      </ui-menubar>
    </div>
  `
}
