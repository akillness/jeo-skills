import "@ui-sdk/web/listbox"
import { createElement, File } from "lucide"
import { log } from "../../../shared/web/log"

const files = [
  { value: "readme", label: "README.md" },
  { value: "package", label: "package.json" },
  { value: "tsconfig", label: "tsconfig.json" },
  { value: "index", label: "index.ts" },
  { value: "styles", label: "styles.css" },
  { value: "logo", label: "logo.svg" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-listbox multiple activation="automatic" default-value="readme" aria-label="Files">
      ${files
        .map(
          (file) => `
            <ui-listbox-item value="${file.value}">
              <ui-listbox-item-icon>${createElement(File, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-icon>
              ${file.label}
            </ui-listbox-item>`
        )
        .join("")}
    </ui-listbox>
  `
  root.querySelector("ui-listbox")!.addEventListener("valuechange", (event) => {
    log(
      root,
      `${(event.detail.value as string[]).length} selected (${event.detail.reason})`
    )
  })
}

export { mount }
