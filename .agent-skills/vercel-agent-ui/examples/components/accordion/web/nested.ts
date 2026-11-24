import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const sections: {
  value: string
  label: string
  content?: string
  topics?: { value: string; label: string; content: string }[]
}[] = [
  {
    value: "profile",
    label: "Profile",
    content: "Your name, photo and the email address people see.",
  },
  {
    value: "notifications",
    label: "Notifications",
    topics: [
      {
        value: "email",
        label: "Email",
        content: "A weekly digest, and mentions as they happen.",
      },
      {
        value: "push",
        label: "Push",
        content: "Direct messages and replies to your comments.",
      },
    ],
  },
  {
    value: "billing",
    label: "Billing",
    topics: [
      {
        value: "payment",
        label: "Payment methods",
        content: "A Visa card ending in 4242, used for every renewal.",
      },
      {
        value: "invoices",
        label: "Invoices",
        content: "Download a PDF of any invoice from the last two years.",
      },
    ],
  },
]

const topics = (list: { value: string; label: string; content: string }[]) => `
  <ui-accordion multiple>
    ${list
      .map(
        (topic) => `
          <ui-accordion-item value="${topic.value}">
            <ui-accordion-header>
              <h4>
                <ui-accordion-trigger>
                  <button type="button" aria-expanded="false">
                    ${topic.label}
                    ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                  </button>
                </ui-accordion-trigger>
              </h4>
            </ui-accordion-header>
            <ui-accordion-panel hidden>
              ${topic.content}
            </ui-accordion-panel>
          </ui-accordion-item>`
      )
      .join("")}
  </ui-accordion>`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-accordion default-value="notifications">
      ${sections
        .map(
          (section) => `
            <ui-accordion-item value="${section.value}">
              <ui-accordion-header>
                <h3>
                  <ui-accordion-trigger>
                    <button type="button" aria-expanded="${section.value === "notifications"}">
                      ${section.label}
                      ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                    </button>
                  </ui-accordion-trigger>
                </h3>
              </ui-accordion-header>
              <ui-accordion-panel${section.value === "notifications" ? "" : " hidden"}>
                ${section.topics ? topics(section.topics) : `<div>${section.content}</div>`}
              </ui-accordion-panel>
            </ui-accordion-item>`
        )
        .join("")}
    </ui-accordion>
  `
}

export { mount }
