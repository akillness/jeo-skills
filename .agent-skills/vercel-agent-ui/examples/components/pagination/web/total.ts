import "@ui-sdk/web/pagination"
import { ChevronLeft, ChevronRight, createElement, Ellipsis } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="row">
        <p>Showing 21–40 of 95</p>
        <label data-slot="label">
          Rows per page
          <select>
            <option value="10">10</option>
            <option value="20" selected>20</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>
      <ui-pagination aria-label="Pagination" total="95" page-size="20" default-page="2">
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
    </div>
  `
  const pagination = root.querySelector("ui-pagination")!
  const select = root.querySelector("select")!
  const showing = (page: number) => {
    const size = Number(select.value)
    root.querySelector("p")!.textContent =
      `Showing ${(page - 1) * size + 1}–${Math.min(page * size, 95)} of 95`
  }
  pagination.addEventListener("pagechange", (event) => {
    showing(event.detail.value)
    if (event.detail.reason !== "imperative") {
      log(root, `Page ${event.detail.value}`)
    }
  })
  select.addEventListener("change", () => {
    pagination.setAttribute("page-size", select.value)
    pagination.page = 1
    showing(1)
    log(root, `${select.value} rows per page`)
  })
}

export { mount }
