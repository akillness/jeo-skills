import "@ui-sdk/web/pagination"
import { ChevronLeft, ChevronRight, createElement, Ellipsis } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-pagination aria-label="Pagination" page-count="10">
      <ui-pagination-list>
        <ui-pagination-item>
          <ui-pagination-previous>
            <button data-variant="ghost">
              ${createElement(ChevronLeft, { "aria-hidden": "true" }).outerHTML}
              <span data-slot="visually-hidden">Previous</span>
            </button>
          </ui-pagination-previous>
        </ui-pagination-item>
        <template>
          <ui-pagination-item>
            <ui-pagination-link>
              <button data-variant="ghost"></button>
            </ui-pagination-link>
          </ui-pagination-item>
        </template>
        <template data-ellipsis>
          <ui-pagination-item>
            <ui-pagination-ellipsis>${createElement(Ellipsis, { "aria-hidden": "true" }).outerHTML}</ui-pagination-ellipsis>
          </ui-pagination-item>
        </template>
        <ui-pagination-item>
          <ui-pagination-next>
            <button data-variant="ghost">
              <span data-slot="visually-hidden">Next</span>
              ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-pagination-next>
        </ui-pagination-item>
      </ui-pagination-list>
    </ui-pagination>
  `
  root
    .querySelector("ui-pagination")!
    .addEventListener("pagechange", (event) => {
      const { value, reason } = event.detail
      log(root, `Page ${value} (${reason})`)
    })
}

export { mount }
