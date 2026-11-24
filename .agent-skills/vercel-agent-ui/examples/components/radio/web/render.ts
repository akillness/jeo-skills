import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"
import { Check, createElement } from "lucide"

const options = [
  {
    value: "all",
    label: "Everything",
    description: "Every message and update.",
  },
  {
    value: "mentions",
    label: "Mentions",
    description: "Only when someone mentions you.",
  },
  { value: "none", label: "Nothing", description: "Turn notifications off." },
]

function mount(root: HTMLElement) {
  const id = crypto.randomUUID()
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Notify me about</ui-field-label>
      <ui-radio-group default-value="mentions">
        ${options
          .map(
            (option) => `
              <ui-radio
                value="${option.value}"
                aria-labelledby="${id}-${option.value}-label"
                aria-describedby="${id}-${option.value}-description"
              >
                <span data-slot="stack">
                  <span id="${id}-${option.value}-label">${option.label}</span>
                  <span data-slot="hint" id="${id}-${option.value}-description">${option.description}</span>
                </span>
                ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
              </ui-radio>
            `
          )
          .join("")}
      </ui-radio-group>
    </ui-field>
  `
  const update = (radio: Element) => {
    radio
      .querySelector("svg")!
      .toggleAttribute("data-checked", radio.hasAttribute("data-checked"))
  }
  const radios = root.querySelectorAll("ui-radio")
  radios.forEach((radio) => {
    new MutationObserver(() => update(radio)).observe(radio, {
      attributeFilter: ["data-checked"],
    })
    update(radio)
  })
}

export { mount }
