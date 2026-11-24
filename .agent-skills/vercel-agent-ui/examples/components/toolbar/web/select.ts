import "@ui-sdk/web/toolbar"
import "@ui-sdk/web/select"
import { Check, ChevronsUpDown, createElement, ZoomIn, ZoomOut } from "lucide"
import { log } from "../../../shared/web/log"

const zooms = ["50%", "75%", "100%", "150%", "200%"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar aria-label="View">
      <ui-toolbar-button data-action="zoom-out">
        <button aria-label="Zoom out">
          ${createElement(ZoomOut, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-toolbar-button>
      <ui-select default-value="100%">
        <ui-toolbar-button>
          <ui-select-trigger>
            <button aria-label="Zoom">
              <ui-select-value></ui-select-value>
              ${createElement(ChevronsUpDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
        </ui-toolbar-button>
        <ui-select-content>
          ${zooms
            .map(
              (zoom) => `
                <ui-select-item value="${zoom}">
                  ${zoom}
                  <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
      <ui-toolbar-button data-action="zoom-in">
        <button aria-label="Zoom in">
          ${createElement(ZoomIn, { "aria-hidden": "true" }).outerHTML}
        </button>
      </ui-toolbar-button>
    </ui-toolbar>
  `
  const select = root.querySelector("ui-select")!
  const zoomOut = root.querySelector("[data-action=zoom-out]")!
  const zoomIn = root.querySelector("[data-action=zoom-in]")!
  const change = (value: string) => {
    const index = zooms.indexOf(value)
    zoomOut.toggleAttribute("disabled", index === 0)
    zoomIn.toggleAttribute("disabled", index === zooms.length - 1)
    log(root, `Zoom ${value}`)
  }
  const step = (by: number) => {
    const value = zooms[zooms.indexOf(select.value as string) + by]
    select.value = value
    change(value)
  }
  zoomOut.addEventListener("click", () => step(-1))
  zoomIn.addEventListener("click", () => step(1))
  select.addEventListener("valuechange", (event) => {
    const value = event.detail.value as string | null
    if (value) {
      change(value)
    }
  })
}

export { mount }
