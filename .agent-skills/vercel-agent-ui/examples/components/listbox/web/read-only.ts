import "@ui-sdk/web/listbox"
import { Check, createElement } from "lucide"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "nuxt", label: "Nuxt" },
  { value: "sveltekit", label: "SvelteKit" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-listbox read-only default-value="nuxt" aria-label="Framework">
      ${frameworks
        .map(
          (framework) => `
            <ui-listbox-item value="${framework.value}">
              ${framework.label}
              <ui-listbox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-indicator>
            </ui-listbox-item>`
        )
        .join("")}
    </ui-listbox>
  `
}

export { mount }
