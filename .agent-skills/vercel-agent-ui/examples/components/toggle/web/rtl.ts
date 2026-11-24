import "@ui-sdk/web/toggle"
import { Bookmark, createElement } from "lucide"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-toggle>
        <button>
          <ui-toggle-icon data-variant="fill">${createElement(Bookmark, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
          إشارة مرجعية
        </button>
      </ui-toggle>
    </div>
  `
}
