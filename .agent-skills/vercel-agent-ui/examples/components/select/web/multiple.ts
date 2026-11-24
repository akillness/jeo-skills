import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const languages = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "pt", label: "Portuguese" },
  { value: "es", label: "Spanish" },
]

function summary(value: string[]) {
  const labels = value.map(
    (key) => languages.find((language) => language.value === key)?.label ?? key
  )
  return labels.length === 0
    ? "Select languages"
    : labels.length > 2
      ? `${labels[0]} and ${labels.length - 1} more`
      : labels.join(", ")
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Languages</ui-field-label>
      <ui-select multiple default-value="en, ja" placeholder="Select languages">
        <ui-select-trigger>
          <button>
            <ui-select-value>${summary(["en", "ja"])}</ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${languages
            .map(
              (language) => `
                <ui-select-item value="${language.value}">
                  ${language.label}
                  <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
  const text = root.querySelector("ui-select-value")!
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    const value = event.detail.value as string[]
    text.textContent = summary(value)
    log(root, `value: ${JSON.stringify(value)}`)
  })
}

export { mount }
