import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import { Clock, createElement, Reply, Search, Share, Trash } from "lucide"

const commands = [
  { value: "reply", icon: Reply, mirror: true },
  { value: "remind", icon: Clock },
  { value: "search", icon: Search },
  { value: "share", icon: Share },
  { value: "clear", icon: Trash },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-trigger-menu>
      <ui-field>
        <ui-field-label>Message</ui-field-label>
        <ui-trigger-menu-input>
          <textarea placeholder="Type / for commands…"></textarea>
        </ui-trigger-menu-input>
      </ui-field>
      <ui-trigger-menu-content>
        <ui-trigger-menu-list>
          ${commands
            .map(
              (command) => `
                <ui-trigger-menu-item value="${command.value}">
                  <ui-trigger-menu-item-icon${command.mirror ? " mirror" : ""}>
                    ${createElement(command.icon, { "aria-hidden": "true" }).outerHTML}
                  </ui-trigger-menu-item-icon>
                  ${command.value}
                </ui-trigger-menu-item>`
            )
            .join("")}
        </ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>
  `
  root.querySelector("ui-trigger-menu")!.triggers = [
    { char: "/", boundary: "start", type: "command" },
  ]
}

export { mount }
