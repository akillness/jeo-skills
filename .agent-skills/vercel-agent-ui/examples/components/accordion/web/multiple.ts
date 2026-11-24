import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const items = [
  {
    value: "notifications",
    label: "Notification settings",
    content: "Choose what we email you about, and how often.",
  },
  {
    value: "privacy",
    label: "Privacy and security",
    content: "Turn on two-factor authentication and review signed-in devices.",
  },
  {
    value: "billing",
    label: "Billing and subscription",
    content: "Update your payment method and download past invoices.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-accordion multiple default-value="notifications">
      ${items
        .map(
          (item) => `
            <ui-accordion-item value="${item.value}">
              <ui-accordion-header>
                <h3>
                  <ui-accordion-trigger>
                    <button type="button" aria-expanded="${item.value === "notifications"}">
                      ${item.label}
                      ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                    </button>
                  </ui-accordion-trigger>
                </h3>
              </ui-accordion-header>
              <ui-accordion-panel${item.value === "notifications" ? "" : " hidden"}>
                ${item.content}
              </ui-accordion-panel>
            </ui-accordion-item>`
        )
        .join("")}
    </ui-accordion>
  `
}

export { mount }
