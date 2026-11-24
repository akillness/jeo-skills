import "@ui-sdk/web/command"
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
    <ui-command>
      <div data-slot="row">
          ${createElement(Search, { "aria-hidden": "true" }).outerHTML}
          <ui-command-input>
            <input aria-label="Search commands" placeholder="Try “prf” or “emo”…" />
          </ui-command-input>
      </div>
      <ui-command-empty>No results found.</ui-command-empty>
      <ui-command-list>
        ${commands
          .map(
            (item) => `
              <ui-command-item value="${item.value}" ${item.disabled ? "disabled" : ""}>
                <ui-command-item-icon>${createElement(item.icon, { "aria-hidden": "true" }).outerHTML}</ui-command-item-icon>
                <ui-command-item-text>${item.label}</ui-command-item-text>
              </ui-command-item>
            `
          )
          .join("")}
      </ui-command-list>
    </ui-command>
  `
}

export { mount }
