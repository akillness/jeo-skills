import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const items = [
  {
    value: "account",
    label: "Account",
    content: "Your name, email address and profile photo.",
  },
  {
    value: "security",
    label: "Security",
    content: "Your password, passkeys and two-factor authentication.",
  },
  {
    value: "sessions",
    label: "Sessions",
    content: "Devices signed in to your account in the last 30 days.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <div data-slot="controls">
        <button type="button">Review security</button>
      </div>
      <ui-accordion multiple default-value="account">
        ${items
          .map(
            (item) => `
              <ui-accordion-item value="${item.value}">
                <ui-accordion-header>
                  <h3>
                    <ui-accordion-trigger>
                      <button type="button" aria-expanded="${item.value === "account"}">
                        ${item.label}
                        ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                      </button>
                    </ui-accordion-trigger>
                  </h3>
                </ui-accordion-header>
                <ui-accordion-panel${item.value === "account" ? "" : " hidden"}>
                  ${item.content}
                </ui-accordion-panel>
              </ui-accordion-item>`
          )
          .join("")}
      </ui-accordion>
    </div>
  `
  const accordion = root.querySelector("ui-accordion")!
  root
    .querySelector("[data-slot=controls] button")!
    .addEventListener("click", () => accordion.api.open("security"))
  accordion.addEventListener(
    "openchange",
    (event) => {
      const open = (event as CustomEvent<{ value: boolean }>).detail.value
      const item = (event.target as HTMLElement).getAttribute("value")
      if (
        !open &&
        item === "security" &&
        !window.confirm("Close the security settings?")
      ) {
        event.preventDefault()
      }
    },
    { capture: true }
  )
}

export { mount }
