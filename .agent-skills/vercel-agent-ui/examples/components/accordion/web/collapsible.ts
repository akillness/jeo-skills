import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const items = [
  {
    value: "overview",
    label: "Overview",
    content: "A summary of the project, its goals and its owners.",
  },
  {
    value: "timeline",
    label: "Timeline",
    content: "Kickoff in March, beta in June and launch in September.",
  },
  {
    value: "budget",
    label: "Budget",
    content: "Approved for two engineers and one designer for six months.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-accordion collapsible="false" default-value="overview">
      ${items
        .map(
          (item) => `
            <ui-accordion-item value="${item.value}">
              <ui-accordion-header>
                <h3>
                  <ui-accordion-trigger>
                    <button type="button" aria-expanded="${item.value === "overview"}">
                      ${item.label}
                      ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                    </button>
                  </ui-accordion-trigger>
                </h3>
              </ui-accordion-header>
              <ui-accordion-panel${item.value === "overview" ? "" : " hidden"}>
                ${item.content}
              </ui-accordion-panel>
            </ui-accordion-item>`
        )
        .join("")}
    </ui-accordion>
  `
}

export { mount }
