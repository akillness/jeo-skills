import "@ui-sdk/web/listbox"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const timezones = Array.from({ length: 27 }, (_, index) => {
  const offset = index - 12
  const label = `UTC${offset < 0 ? "−" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`
  return { value: `utc${offset}`, label }
})

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-listbox default-value="utc9" aria-label="Time zone">
      ${timezones
        .map(
          (zone, index) => `
            <ui-listbox-item value="${zone.value}" index="${index}">
              ${zone.label}
              <ui-listbox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-indicator>
            </ui-listbox-item>`
        )
        .join("")}
    </ui-listbox>
  `
  root.querySelector("ui-listbox")!.addEventListener("highlight", (event) => {
    const { value, index } = event.detail
    if (value) {
      log(
        root,
        `Focused ${timezones[index].label} (${index + 1} of ${timezones.length})`
      )
    }
  })
}

export { mount }
