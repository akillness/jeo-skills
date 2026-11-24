import "@ui-sdk/web/command"
import { createElement, CreditCard, Settings, User } from "lucide"
import { log } from "../../../shared/web/log"

const settings = [
  { value: "profile", label: "Profile", icon: User, shortcut: "mod+p" },
  { value: "billing", label: "Billing", icon: CreditCard, shortcut: "mod+b" },
  { value: "settings", label: "Settings", icon: Settings, shortcut: "mod+s" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-command>
        <ui-command-input>
          <input aria-label="Search settings" placeholder="Search settings…" />
        </ui-command-input>
        <ui-command-list>
          <ui-command-group>
            <ui-command-group-label>Settings</ui-command-group-label>
            ${settings
              .map(
                (item) => `
                  <ui-command-item value="${item.value}" shortcut="${item.shortcut}">
                    <ui-command-item-icon>${createElement(item.icon, { "aria-hidden": "true" }).outerHTML}</ui-command-item-icon>
                    <span>${item.label}</span>
                    <ui-command-shortcut></ui-command-shortcut>
                  </ui-command-item>
                `
              )
              .join("")}
          </ui-command-group>
        </ui-command-list>
      </ui-command>
    </div>
  `
  root
    .querySelector("ui-command")!
    .addEventListener("action", (event) =>
      log(root, `Ran ${event.detail.value}`)
    )
}

export { mount }
