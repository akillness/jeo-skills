import "@ui-sdk/web/select"
import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import { Check, ChevronDown, createElement } from "lucide"

const sides = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
]
const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]

const check = createElement(Check, { "aria-hidden": "true" }).outerHTML
const chevron = createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML

function select(
  attribute: string,
  label: string,
  value: string,
  options: { value: string; label: string }[]
) {
  return `
    <ui-select data-attribute="${attribute}" default-value="${value}">
      <ui-select-label>${label}</ui-select-label>
      <ui-select-trigger>
        <button>
          <ui-select-value></ui-select-value>
          ${chevron}
        </button>
      </ui-select-trigger>
      <ui-select-content hidden>
        ${options
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
  `
}

function mount(root: HTMLElement) {
  const toast = createToaster()
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        ${select("side", "Side", "bottom", sides)}
        ${select("align", "Align", "end", aligns)}
      </div>
      <button>Create Event</button>
      <ui-toast-region side="bottom" align="end">
        <template>
          <ui-toast>
            <div data-slot="stack">
              <ui-toast-title></ui-toast-title>
              <ui-toast-description></ui-toast-description>
            </div>
          </ui-toast>
        </template>
      </ui-toast-region>
    </div>
  `
  const region = root.querySelector("ui-toast-region")!
  region.toaster = toast
  for (const control of root.querySelectorAll("ui-select")) {
    control.addEventListener("valuechange", (event) => {
      const value = event.detail.value
      if (typeof value === "string") {
        region.setAttribute(control.dataset.attribute!, value)
      }
    })
  }
  root
    .querySelector("[data-slot='controls'] + button")!
    .addEventListener("click", () =>
      toast("Event created", { description: "Friday, June 12 at 10:00 AM" })
    )
  return () => {
    toast.dismiss()
  }
}

export { mount }
