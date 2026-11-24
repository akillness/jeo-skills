import "@ui-sdk/web/menu"
import {
  ChevronRight,
  createElement,
  File,
  Folder,
  Link,
  Mail,
  Share,
  Trash,
} from "lucide"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl" data-slot="stack">
      <ui-menu>
        <ui-menu-trigger>
          <button>ملف</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item value="new" shortcut="mod+n">
            ${createElement(File, { "aria-hidden": "true" }).outerHTML}
            جديد
          </ui-menu-item>
          <ui-menu-item value="open" shortcut="mod+o">
            ${createElement(Folder, { "aria-hidden": "true" }).outerHTML}
            فتح…
          </ui-menu-item>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-sub>
            <ui-menu-sub-trigger>
              ${createElement(Share, { "aria-hidden": "true" }).outerHTML}
              مشاركة
              ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
            </ui-menu-sub-trigger>
            <ui-menu-sub-content>
              <ui-menu-item value="email">
                ${createElement(Mail, { "aria-hidden": "true" }).outerHTML}
                البريد الإلكتروني
              </ui-menu-item>
              <ui-menu-item value="copy-link">
                ${createElement(Link, { "aria-hidden": "true" }).outerHTML}
                نسخ الرابط
              </ui-menu-item>
            </ui-menu-sub-content>
          </ui-menu-sub>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-item value="delete">
            ${createElement(Trash, { "aria-hidden": "true" }).outerHTML}
            حذف
          </ui-menu-item>
        </ui-menu-content>
      </ui-menu>
      <output data-slot="output">اختر عنصرًا</output>
    </div>
  `
  root.addEventListener(
    "action",
    (event) => {
      root.querySelector("output")!.textContent =
        `نُفّذ: ${(event as CustomEvent<{ value: string }>).detail.value}`
    },
    { capture: true }
  )
}
