import "@ui-sdk/web/listbox"
import { createElement, ExternalLink } from "lucide"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "nuxt", label: "Nuxt" },
  { value: "sveltekit", label: "SvelteKit" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-listbox default-value="next" activation="manual" aria-label="Framework docs">
      ${frameworks
        .map(
          (framework) => `
            <ui-listbox-item value="${framework.value}" label="${framework.label}" as-child>
              <a href="#${framework.value}">
                <span>${framework.label}</span>
              </a>
            </ui-listbox-item>`
        )
        .join("")}
    </ui-listbox>
  `
  const listbox = root.querySelector("ui-listbox")!
  const icon = createElement(ExternalLink, { "aria-hidden": "true" })
  function update() {
    const link = root.querySelector(`a[href="#${listbox.value}"]`)
    if (link) {
      link.append(icon)
    } else {
      icon.remove()
    }
  }
  update()
  listbox.addEventListener("valuechange", update)
}

export { mount }
