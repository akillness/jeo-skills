import "@ui-sdk/web/checkbox"
import { Check, createElement, Plus } from "lucide"

const topics = [
  { value: "design", label: "Design", checked: true },
  { value: "engineering", label: "Engineering", checked: false },
  { value: "marketing", label: "Marketing", checked: false },
  { value: "sales", label: "Sales", checked: false },
]

const icon = (checked: boolean) =>
  createElement(checked ? Check : Plus, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <fieldset>
      <legend>Topics you follow</legend>
      <div data-slot="row">
        ${topics
          .map(
            (topic) =>
              `<ui-checkbox name="topics" value="${topic.value}"${topic.checked ? " default-checked" : ""}>${icon(topic.checked)}${topic.label}</ui-checkbox>`
          )
          .join("")}
      </div>
    </fieldset>
  `
  const update = (checkbox: Element) => {
    checkbox.querySelector("svg")!.outerHTML = icon(
      checkbox.hasAttribute("data-checked")
    )
  }
  new MutationObserver((records) =>
    records.forEach((record) => update(record.target as Element))
  ).observe(root, { subtree: true, attributeFilter: ["data-checked"] })
  root.querySelectorAll("ui-checkbox").forEach(update)
}

export { mount }
