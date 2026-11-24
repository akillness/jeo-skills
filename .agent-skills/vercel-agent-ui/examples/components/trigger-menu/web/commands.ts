import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

const commands = [
  {
    value: "status",
    label: "status",
    arguments: [
      {
        name: "status",
        hint: "<status>",
        required: true,
        items: ["available", "busy", "away"],
      },
      {
        name: "until",
        hint: "[until]",
        items: ["30m", "1h", "4h", "today"],
        allowCustomValue: false,
      },
    ],
  },
  {
    value: "search",
    label: "search",
    arguments: [{ name: "query", hint: "<query>", required: true }],
  },
  { value: "away", label: "away", after: "submit" as const },
  { value: "clear", label: "clear" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-trigger-menu>
        <ui-field name="message">
          <ui-field-label>Message</ui-field-label>
          <ui-trigger-menu-input>
            <textarea placeholder="Type / for commands…"></textarea>
          </ui-trigger-menu-input>
        </ui-field>
        <ui-trigger-menu-hint></ui-trigger-menu-hint>
      </ui-trigger-menu>
    </form>
  `
  const form = root.querySelector("form")!
  const menu = root.querySelector("ui-trigger-menu")!
  menu.triggers = [
    { char: "/", boundary: "start", type: "command", items: commands },
  ]
  menu.addEventListener("itemselect", (event) => {
    log(
      root,
      [
        "Chose",
        `/${event.detail.value}`,
        ...Object.values(event.detail.arguments),
      ].join(" ")
    )
  })
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Sent ${new FormData(form).get("message")}`)
  })
}

export { mount }
