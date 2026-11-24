import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement, X } from "lucide"
import { log } from "../../../shared/web/log"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
]

const frameworkLabel = (value: string) =>
  frameworks.find((framework) => framework.value === value)?.label ?? value

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox default-value="sveltekit">
      <div data-slot="stack">
        <ui-combobox-label>Framework</ui-combobox-label>
        <div data-slot="row">
          <ui-combobox-input>
            <input placeholder="Select a framework" />
          </ui-combobox-input>
          <ui-combobox-clear>
            <button aria-label="Clear framework">${createElement(X, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-combobox-clear>
          <ui-combobox-trigger>
            <button aria-label="Show frameworks">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-combobox-trigger>
        </div>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>No frameworks found.</ui-combobox-empty>
        <ui-combobox-list>
          ${frameworks
            .map(
              (framework) => `
                <ui-combobox-item value="${framework.value}" label="${framework.label}">
                  ${framework.label}
                  <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                </ui-combobox-item>
              `
            )
            .join("")}
        </ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>
  `
  const combobox = root.querySelector("ui-combobox")!
  combobox.itemToLabel = (value) => frameworkLabel(value as string)
  combobox.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(
      root,
      `${value ? frameworkLabel(value as string) : "Cleared"} (${reason})`
    )
  })
}

export { mount }
