import "@ui-sdk/web/tooltip"
import { createElement, File } from "lucide"

const files = [
  "Quarterly report, final revised version for the board.pdf",
  "Notes.txt",
  "Design review recording, October 2nd.mp4",
  "Budget.xlsx",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ul>
      ${files
        .map(
          (file) => `
      <li>
        <ui-tooltip type="label">
          <ui-tooltip-trigger><button>${createElement(File, { "aria-hidden": "true" }).outerHTML}<span>${file}</span></button></ui-tooltip-trigger>
          <ui-tooltip-content>${file}</ui-tooltip-content>
        </ui-tooltip>
      </li>`
        )
        .join("")}
    </ul>
  `
  for (const tooltip of root.querySelectorAll("ui-tooltip")) {
    tooltip.addEventListener("openchange", (event) => {
      const name = tooltip.querySelector("span")
      if (event.detail.value && name && name.scrollWidth <= name.clientWidth) {
        event.preventDefault()
      }
    })
  }
}

export { mount }
