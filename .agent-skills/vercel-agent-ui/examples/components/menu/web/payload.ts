import type { UiMenuElement } from "@ui-sdk/web/menu"
import "@ui-sdk/web/menu"
import { createElement, Ellipsis } from "lucide"
import { log } from "../../../shared/web/log"

type File = { name: string; size: string }

const files: File[] = [
  { name: "Roadmap.pdf", size: "2.4 MB" },
  { name: "Budget.xlsx", size: "860 KB" },
  { name: "Team photo.jpg", size: "5.1 MB" },
]

let count = 0

function mount(root: HTMLElement) {
  const id = `file-actions-${++count}`
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button>Open ${files[0].name} Actions</button>
      </div>
      <ul data-slot="list"></ul>
      <ui-menu id="${id}">
        <ui-menu-content align="end">
          <ui-menu-group>
            <ui-menu-group-label></ui-menu-group-label>
            <ui-menu-item value="open">Open</ui-menu-item>
            <ui-menu-item value="rename">Rename</ui-menu-item>
            <ui-menu-item value="duplicate">Duplicate</ui-menu-item>
          </ui-menu-group>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-item value="delete">Delete</ui-menu-item>
        </ui-menu-content>
      </ui-menu>
    </div>
  `
  const menu = root.querySelector<UiMenuElement<File>>("ui-menu")!
  const label = root.querySelector("ui-menu-group-label")!

  for (const file of files) {
    const row = document.createElement("li")
    row.dataset.slot = "row"
    row.innerHTML = `${file.name}<span data-slot="hint">${file.size}</span>`
    const trigger = Object.assign(document.createElement("ui-menu-trigger"), {
      payload: file,
    })
    trigger.setAttribute("for", id)
    trigger.innerHTML = `
      <button data-variant="ghost" data-size="sm" aria-label="Actions for ${file.name}">
        ${createElement(Ellipsis, { "aria-hidden": "true" }).outerHTML}
      </button>
    `
    row.append(trigger)
    root.querySelector("ul")!.append(row)
  }

  menu.addEventListener("payloadchange", (event) => {
    const file = event.detail.value
    label.textContent = file?.name ?? ""
  })
  menu.addEventListener("action", (event) => {
    const { value } = event.detail
    log(root, `${value} ${menu.api.getPayload()?.name}`)
  })

  const opener = root.querySelector<HTMLButtonElement>(
    '[data-slot="controls"] button'
  )!
  opener.addEventListener("click", async () => {
    const result = await menu.api.open({ payload: files[0], anchor: opener })
    log(root, `Closed with ${result.reason}`)
  })
}

export { mount }
