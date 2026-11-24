import "@ui-sdk/web/toolbar"
import "@ui-sdk/web/toggle"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  createElement,
  List,
  ListOrdered,
} from "lucide"
import { log } from "../../../shared/web/log"

const alignments = [
  { value: "left", label: "Align left", icon: AlignLeft },
  { value: "center", label: "Align center", icon: AlignCenter },
  { value: "right", label: "Align right", icon: AlignRight },
]

const lists = [
  { value: "bulleted", label: "Bulleted list", icon: List },
  { value: "numbered", label: "Numbered list", icon: ListOrdered },
]

const toggles = (items: typeof alignments) =>
  items
    .map(
      (item) => `
        <ui-toggle value="${item.value}">
          <button aria-label="${item.label}">
            <ui-toggle-icon>${createElement(item.icon, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
          </button>
        </ui-toggle>
      `
    )
    .join("")

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toolbar aria-label="Paragraph">
      <ui-toggle-group default-value="left" deselectable="false" aria-label="Alignment">
        ${toggles(alignments)}
      </ui-toggle-group>
      <ui-toolbar-separator></ui-toolbar-separator>
      <ui-toggle-group aria-label="List">
        ${toggles(lists)}
      </ui-toggle-group>
    </ui-toolbar>
  `
  const [alignment, list] = root.querySelectorAll("ui-toggle-group")
  alignment.addEventListener("valuechange", (event) =>
    log(root, `Align ${event.detail.value[0]}`)
  )
  list.addEventListener("valuechange", (event) => {
    const [value] = event.detail.value
    log(root, lists.find((list) => list.value === value)?.label ?? "No list")
  })
}

export { mount }
