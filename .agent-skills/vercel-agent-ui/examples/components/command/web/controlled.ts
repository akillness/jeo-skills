import "@ui-sdk/web/command"
import { log } from "../../../shared/web/log"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-command default-value="dark" default-pages="theme">
      <ui-command-input>
        <input aria-label="Search themes" placeholder="Search themes…" />
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
  `
  const command = root.querySelector("ui-command")!
  command.addEventListener("valuechange", (event) =>
    log(
      root,
      `Highlighted ${event.detail.value ?? "nothing"} (${event.detail.reason})`
    )
  )
  command.addEventListener("querychange", (event) =>
    log(root, `Query “${event.detail.value}” (${event.detail.reason})`)
  )
  command.addEventListener("pageschange", (event) =>
    log(
      root,
      `Pages [${event.detail.value.join(", ")}] (${event.detail.reason})`
    )
  )
  command.addEventListener("action", (event) =>
    log(root, `Ran ${event.detail.value}`)
  )
}

export { mount }
