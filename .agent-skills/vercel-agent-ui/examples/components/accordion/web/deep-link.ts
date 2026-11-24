import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const items = [
  {
    value: "returns",
    label: "Returns",
    content: `
      <p>Return any unused item in its original packaging within 30 days.</p>
      <p id="return-label">To print a return label, open the order and choose Return. The label is free.</p>`,
  },
  {
    value: "refunds",
    label: "Refunds",
    content: `
      <p>Refunds go back to the card you paid with.</p>
      <p id="refund-timeline">Timeline: we inspect the item within 2 days of receiving it, and your bank shows the refund 5 to 7 business days later.</p>`,
  },
  {
    value: "exchanges",
    label: "Exchanges",
    content: `
      <p>Start a return, choose Exchange and pick the new size. Shipping both ways is free.</p>`,
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <nav data-slot="controls" aria-label="Jump to">
        <a href="#refund-timeline">Jump to the refund timeline</a>
        <a href="#return-label">Print a return label</a>
      </nav>
      <ui-accordion hidden-until-found>
        ${items
          .map(
            (item) => `
              <ui-accordion-item value="${item.value}">
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
                <ui-accordion-panel hidden="until-found">
                  <div data-slot="stack">${item.content}</div>
                </ui-accordion-panel>
              </ui-accordion-item>`
          )
          .join("")}
      </ui-accordion>
    </div>
  `
}

export { mount }
