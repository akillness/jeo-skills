import "@ui-sdk/web/pagination"
import { ArrowLeft, ArrowRight, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-pagination aria-label="Pagination" page-count="10">
      <ui-pagination-list>
        <ui-pagination-item>
          <ui-pagination-previous>
            <button aria-label="Previous page">
              ${createElement(ArrowLeft, { "aria-hidden": "true" }).outerHTML}
              <span aria-hidden="true"></span>
            </button>
          </ui-pagination-previous>
        </ui-pagination-item>
        <template>
          <ui-pagination-item>
            <ui-pagination-link>
              <button></button>
            </ui-pagination-link>
          </ui-pagination-item>
        </template>
        <ui-pagination-item>
          <ui-pagination-next>
            <button aria-label="Next page">
              <span aria-hidden="true"></span>
              ${createElement(ArrowRight, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-pagination-next>
        </ui-pagination-item>
      </ui-pagination-list>
    </ui-pagination>
  `
  const pagination = root.querySelector("ui-pagination")!

  function step(selector: string, page: number) {
    const button = root.querySelector<HTMLButtonElement>(`${selector} button`)!
    const disabled = page < 1 || page > pagination.api.getPageCount()
    button.querySelector("span")!.hidden = disabled
    button.querySelector("span")!.textContent = String(page)
    if (disabled) {
      button.removeAttribute("title")
    } else {
      button.title = `Go to page ${page}`
    }
  }

  function update() {
    const page = pagination.page
    step("ui-pagination-previous", page - 1)
    step("ui-pagination-next", page + 1)
    for (const link of root.querySelectorAll("ui-pagination-link[page]")) {
      const n = Number(link.getAttribute("page"))
      link.querySelector("button")!.textContent =
        n === page ? `Page ${n}` : String(n)
    }
  }

  queueMicrotask(update)
  pagination.addEventListener("pagechange", () => queueMicrotask(update))
}

export { mount }
