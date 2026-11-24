import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const items = [
  {
    value: "shipping",
    label: "What are your shipping options?",
    content: [
      "We offer standard (5 to 7 days), express (2 to 3 days) and overnight shipping.",
      "Every order ships with tracking, and orders over $50 ship free.",
    ],
  },
  {
    value: "returns",
    label: "What is your return policy?",
    content: [
      "Return any unused item in its original packaging within 30 days. Refunds arrive within 5 to 7 business days.",
    ],
  },
  {
    value: "support",
    label: "How can I reach support?",
    content: [
      "Write to us by email or chat, or call us. We answer within 24 hours on business days.",
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-accordion default-value="shipping">
      ${items
        .map(
          (item) => `
            <ui-accordion-item value="${item.value}">
              <ui-accordion-header>
                <h3>
                  <ui-accordion-trigger>
                    <button type="button" aria-expanded="${item.value === "shipping"}">
                      ${item.label}
                      ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                    </button>
                  </ui-accordion-trigger>
                </h3>
              </ui-accordion-header>
              <ui-accordion-panel${item.value === "shipping" ? "" : " hidden"}>
                ${item.content.map((paragraph) => `<p>${paragraph}</p>`).join("")}
              </ui-accordion-panel>
            </ui-accordion-item>`
        )
        .join("")}
    </ui-accordion>
  `
}

export { mount }
