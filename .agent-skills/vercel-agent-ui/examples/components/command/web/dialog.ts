import "@ui-sdk/web/command"
import "@ui-sdk/web/dialog"
import {
  Calculator,
  Calendar,
  createElement,
  CreditCard,
  Search,
  Settings,
  Smile,
  User,
} from "lucide"
import { log } from "../../../shared/web/log"

const commands = [
  { value: "calendar", label: "Calendar", icon: Calendar },
  { value: "emoji", label: "Search Emoji", icon: Smile },
  {
    value: "calculator",
    label: "Calculator",
    icon: Calculator,
    disabled: true,
  },
  { value: "profile", label: "Profile", icon: User },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "settings", label: "Settings", icon: Settings },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-dialog>
        <ui-dialog-trigger shortcut="mod+k">
          <button>
            Search…
            <ui-dialog-shortcut></ui-dialog-shortcut>
          </button>
        </ui-dialog-trigger>
        <ui-dialog-backdrop hidden></ui-dialog-backdrop>
        <ui-dialog-content hidden>
          <ui-dialog-title>Command palette</ui-dialog-title>
          <ui-command>
            <div data-slot="row">
              ${createElement(Search, { "aria-hidden": "true" }).outerHTML}
              <ui-command-input>
                <input aria-label="Search commands" placeholder="Type a command or search…" />
              </ui-command-input>
            </div>
            <ui-command-empty>No results found.</ui-command-empty>
            <ui-command-list>
              <ui-command-group>
                <ui-command-group-label>Suggestions</ui-command-group-label>
                ${commands
                  .map(
                    (item) => `
                      <ui-command-item value="${item.value}" ${item.disabled ? "disabled" : ""}>
                        <ui-command-item-icon>${createElement(item.icon, { "aria-hidden": "true" }).outerHTML}</ui-command-item-icon>
                        ${item.label}
                      </ui-command-item>
                    `
                  )
                  .join("")}
              </ui-command-group>
            </ui-command-list>
          </ui-command>
        </ui-dialog-content>
      </ui-dialog>
    </div>
  `
  const dialog = root.querySelector("ui-dialog")!
  root.querySelector("ui-command")!.addEventListener("action", (event) => {
    log(root, `Ran ${event.detail.value}`)
    dialog.open = false
  })
}

export { mount }
