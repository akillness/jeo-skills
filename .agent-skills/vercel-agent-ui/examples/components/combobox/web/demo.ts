import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement } from "lucide"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox>
      <div data-slot="stack">
        <ui-combobox-label>Framework</ui-combobox-label>
        <div data-slot="row">
          <ui-combobox-input>
            <input placeholder="Select a framework" />
          </ui-combobox-input>
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
}

export { mount }
