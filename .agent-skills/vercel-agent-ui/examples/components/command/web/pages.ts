import "@ui-sdk/web/command"
import { ArrowLeft, createElement, Moon, Users } from "lucide"

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const teams = [
  { value: "design", label: "Design" },
  { value: "engineering", label: "Engineering" },
  { value: "marketing", label: "Marketing" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-command>
      <div data-slot="row"></div>
      <ui-command-input>
        <input aria-label="Search commands" placeholder="What do you need?" />
      </ui-command-input>
      <ui-command-empty>No results found.</ui-command-empty>
      <ui-command-list>
        <ui-command-page>
          <ui-command-group>
            <ui-command-group-label>Workspace</ui-command-group-label>
            <ui-command-item value="theme" page="theme">
              <ui-command-item-icon>${createElement(Moon, { "aria-hidden": "true" }).outerHTML}</ui-command-item-icon>
              Change theme…
            </ui-command-item>
            <ui-command-item value="teams" page="teams">
              <ui-command-item-icon>${createElement(Users, { "aria-hidden": "true" }).outerHTML}</ui-command-item-icon>
              Switch team…
            </ui-command-item>
          </ui-command-group>
        </ui-command-page>
        <ui-command-page value="theme">
          ${themes
            .map(
              (theme) =>
                `<ui-command-item value="${theme.value}">${theme.label}</ui-command-item>`
            )
            .join("")}
        </ui-command-page>
        <ui-command-page value="teams">
          ${teams
            .map(
              (team) =>
                `<ui-command-item value="${team.value}">${team.label}</ui-command-item>`
            )
            .join("")}
        </ui-command-page>
      </ui-command-list>
    </ui-command>
  `
  const command = root.querySelector("ui-command") as HTMLElement & {
    api: { pop: () => void }
  }
  const breadcrumb = command.querySelector("div")!
  const input = command.querySelector("input")!
  const list = command.querySelector("ui-command-list")!
  const back = document.createElement("ui-command-item")
  back.setAttribute("value", "back")
  back.innerHTML = `<ui-command-item-icon mirror>${createElement(ArrowLeft, { "aria-hidden": "true" }).outerHTML}</ui-command-item-icon>Go back`
  command.addEventListener("action", (event) => {
    if ((event as CustomEvent<{ value: string }>).detail.value === "back") {
      command.api.pop()
    }
  })
  command.addEventListener("pageschange", (event) => {
    const pages = (event as CustomEvent<{ value: string[] }>).detail.value
    breadcrumb.innerHTML = pages
      .map((page) => `<span data-slot="badge">${page}</span>`)
      .join("")
    input.placeholder = pages.length
      ? "Search… (Backspace to go back)"
      : "What do you need?"
    if (!pages.length) {
      back.remove()
    } else if (!back.isConnected) {
      list.append(back)
    }
  })
}

export { mount }
