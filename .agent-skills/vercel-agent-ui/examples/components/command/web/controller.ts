import "@ui-sdk/web/command"
import { log } from "../../../shared/web/log"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="push">Open Themes</button>
        <button type="button" data-action="pop">Back</button>
        <button type="button" data-action="highlight">Highlight Dark</button>
        <button type="button" data-action="search">Search “li”</button>
        <button type="button" data-action="run">Run Highlighted</button>
        <button type="button" data-action="focus">Focus</button>
      </div>
      <ui-command>
        <ui-command-input>
          <input aria-label="Search commands" />
        </ui-command-input>
        <ui-command-list>
          <ui-command-page>
            <ui-command-item value="theme" page="theme">Change theme…</ui-command-item>
          </ui-command-page>
          <ui-command-page value="theme">
            ${themes
              .map(
                (theme) =>
                  `<ui-command-item value="${theme.value}">${theme.label}</ui-command-item>`
              )
              .join("")}
          </ui-command-page>
        </ui-command-list>
      </ui-command>
    </div>
  `
  const command = root.querySelector("ui-command")!
  const palette = command.api
  const actions: Record<string, () => void> = {
    push: () => palette.push("theme"),
    pop: () => palette.pop(),
    highlight: () => palette.setValue("dark"),
    search: () => palette.setQuery("li"),
    run: () => palette.run(),
    focus: () => palette.focus(),
  }
  for (const button of root.querySelectorAll<HTMLElement>("[data-action]")) {
    button.addEventListener("click", () => actions[button.dataset.action!]())
  }
  command.addEventListener("action", (event) =>
    log(root, `Ran ${event.detail.value}`)
  )
}

export { mount }
