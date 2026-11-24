import "@ui-sdk/web/combobox"
import { Check, createElement, LoaderCircle, Plus } from "lucide"

const labels = [
  "Bug",
  "Feature",
  "Documentation",
  "Design",
  "Performance",
  "Security",
  "Testing",
]

function saveLabel(name: string) {
  return new Promise<void>((resolve, reject) =>
    setTimeout(
      () =>
        name.length > 20
          ? reject(new Error("Labels are 20 characters at most."))
          : resolve(),
      800
    )
  )
}

const item = (label: string) => `
  <ui-combobox-item value="${label}">
    ${label}
    <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
  </ui-combobox-item>
`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox multiple default-value="Bug">
      <div data-slot="stack">
        <ui-combobox-label>Labels</ui-combobox-label>
        <ui-combobox-chips>
          <ui-combobox-input>
            <input placeholder="Add or create a label…" />
          </ui-combobox-input>
        </ui-combobox-chips>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-list>
          ${labels.map(item).join("")}
          <ui-combobox-create min-length="2">
            ${createElement(LoaderCircle, { "data-slot": "spinner", "data-show": "pending", "aria-hidden": "true" }).outerHTML}
            <span data-show="pending">Creating “<span data-query></span>”…</span>
            ${createElement(Plus, { "data-hide": "pending", "aria-hidden": "true" }).outerHTML}
            <span data-slot="stack" data-hide="pending">
              <span>Create “<span data-query></span>”</span>
              <span data-error data-slot="hint"></span>
            </span>
          </ui-combobox-create>
        </ui-combobox-list>
      </ui-combobox-content>
      <template>
        <ui-combobox-chip>
          <ui-combobox-chip-remove><button type="button">×</button></ui-combobox-chip-remove>
        </ui-combobox-chip>
      </template>
    </ui-combobox>
  `
  const combobox = root.querySelector("ui-combobox") as HTMLElement & {
    value: string[]
  }
  const error = root.querySelector("[data-error]")!
  combobox.addEventListener("querychange", (event) => {
    const query = (event as CustomEvent<{ value: string }>).detail.value.trim()
    for (const span of root.querySelectorAll("[data-query]")) {
      span.textContent = query
    }
  })
  combobox.addEventListener("create", (event) => {
    const { value, waitUntil } = (
      event as CustomEvent<{
        value: string
        waitUntil: (promise: Promise<unknown>) => void
      }>
    ).detail
    error.textContent = ""
    waitUntil(
      saveLabel(value).then(
        () => {
          root
            .querySelector("ui-combobox-create")!
            .insertAdjacentHTML("beforebegin", item(value))
          combobox.value = [...combobox.value, value]
        },
        (reason: Error) => {
          error.textContent = reason.message
          throw reason
        }
      )
    )
  })
}

export { mount }
