import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const items: {
  value: string
  label: string
  content: string
  disabled?: boolean
}[] = [
  {
    value: "access",
    label: "Can I access my account history?",
    content:
      "Yes. Every order and payment from the last five years is in your account.",
  },
  {
    value: "premium",
    label: "Premium feature information",
    content:
      "Premium includes priority support and early access to new features.",
    disabled: true,
  },
  {
    value: "email",
    label: "How do I update my email address?",
    content:
      "Open Settings, then Account, and change it there. We'll send a confirmation link.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-accordion>
      ${items
        .map(
          (item) => `
            <ui-accordion-item value="${item.value}"${item.disabled ? " disabled" : ""}>
              <ui-accordion-header>
                <h3>
                  <ui-accordion-trigger>
                    <button type="button" aria-expanded="false">
                      ${item.label}
                      ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                    </button>
                  </ui-accordion-trigger>
                </h3>
              </ui-accordion-header>
              <ui-accordion-panel hidden>
                ${item.content}
              </ui-accordion-panel>
            </ui-accordion-item>`
        )
        .join("")}
    </ui-accordion>
  `
}

export { mount }
