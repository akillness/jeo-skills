import type { CommandData } from "@ui-sdk/core/command"
import "@ui-sdk/web/command"
import { log } from "../../../shared/web/log"

const commands: CommandData = [
  {
    type: "group",
    label: "Navigation",
    items: [
      { value: "home", label: "Go home", keywords: ["start"] },
      { value: "inbox", label: "Open inbox", shortcut: "mod+i" },
    ],
  },
  { type: "separator" },
  {
    type: "group",
    label: "Preferences",
    items: [
      {
        value: "theme",
        label: "Change theme…",
        items: [
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
          { value: "system", label: "System" },
        ],
      },
      {
        value: "language",
        label: "Change language…",
        items: ["English", "Français", "Deutsch", "日本語"],
      },
      { value: "sign-out", label: "Sign out", shortcut: "mod+shift+q" },
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-command>
        <ui-command-input>
          <input aria-label="Search commands" placeholder="Type a command…" />
        </ui-command-input>
        <ui-command-empty>No results found.</ui-command-empty>
        <template>
          <ui-command-list>
            <ui-command-group>
              <ui-command-group-label></ui-command-group-label>
              <ui-command-item>
                <ui-command-shortcut></ui-command-shortcut>
              </ui-command-item>
            </ui-command-group>
            <ui-command-separator></ui-command-separator>
          </ui-command-list>
        </template>
      </ui-command>
    </div>
  `
  const command = root.querySelector("ui-command")!
  command.items = commands
  command.addEventListener("action", (event) =>
    log(root, `Ran ${event.detail.value}`)
  )
}

export { mount }
