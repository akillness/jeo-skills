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

const suggestions = [
  { value: "calendar", label: "Calendar", icon: Calendar },
  { value: "emoji", label: "Search Emoji", icon: Smile },
  {
    value: "calculator",
    label: "Calculator",
    icon: Calculator,
    disabled: true,
  },
]

const settings = [
  { value: "profile", label: "Profile", icon: User, shortcut: "mod+p" },
  { value: "billing", label: "Billing", icon: CreditCard, shortcut: "mod+b" },
  { value: "settings", label: "Settings", icon: Settings, shortcut: "mod+s" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
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
          ${suggestions
            .map(
              (item) => `
                <ui-command-item value="${item.value}" ${item.disabled ? "disabled" : ""}>
                  <ui-command-item-icon>${createElement(item.icon, { "aria-hidden": "true" }).outerHTML}</ui-command-item-icon>
                  <span>${item.label}</span>
                </ui-command-item>
              `
            )
            .join("")}
        </ui-command-group>
        <ui-command-separator></ui-command-separator>
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
  `
}

export { mount }
