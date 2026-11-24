import "@ui-sdk/web/button"
import { ChevronRight, createElement } from "lucide"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row" dir="rtl">
      <ui-button>
        <button>
          متابعة
          ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-button>
      <ui-button>
        <button>إلغاء</button>
      </ui-button>
    </div>
  `
}
