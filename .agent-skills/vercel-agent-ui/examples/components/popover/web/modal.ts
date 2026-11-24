import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"
import "@ui-sdk/web/popover"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const modes = [
  { value: "false", label: "Non-modal" },
  { value: "trap-focus", label: "Trap focus" },
  { value: "true", label: "Modal" },
]

type Mode = "false" | "trap-focus" | "true"

const notes = {
  false: "Tab can leave, and focus leaving closes it.",
  "trap-focus": "Tab stays inside. The page still scrolls and takes clicks.",
  true: "Tab stays inside. The page is inert and doesn't scroll.",
}

const check = createElement(Check, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <ui-select default-value="false">
          <ui-select-label>Modal</ui-select-label>
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content hidden>
            ${modes
              .map(
                (option) => `
                  <ui-select-item value="${option.value}">
                    ${option.label}
                    <ui-select-item-indicator>${check}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </div>
      <ui-popover modal="false">
        <ui-popover-trigger>
          <button>Add Comment</button>
        </ui-popover-trigger>
        <ui-popover-content>
          <ui-popover-title>Add a comment</ui-popover-title>
          <ui-popover-description>${notes.false}</ui-popover-description>
          <ui-field>
            <ui-field-label>Comment</ui-field-label>
            <ui-textarea>
              <textarea>Looks good to me.</textarea>
            </ui-textarea>
          </ui-field>
          <div data-slot="row">
            <ui-popover-close>
              <button>Cancel</button>
            </ui-popover-close>
            <ui-popover-close>
              <button data-variant="solid">Comment</button>
            </ui-popover-close>
          </div>
        </ui-popover-content>
      </ui-popover>
    </div>
  `
  const popover = root.querySelector("ui-popover")!
  const description = root.querySelector("ui-popover-description")!
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    const mode = event.detail.value as Mode | null
    if (!mode) {
      return
    }
    popover.setAttribute("modal", mode)
    description.textContent = notes[mode]
  })
}

export { mount }
