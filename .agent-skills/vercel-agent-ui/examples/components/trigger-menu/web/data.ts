import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import type { TriggerDefinition } from "@ui-sdk/web/trigger-menu"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

const commands = ["away", "remind", "search", "status"]

const channels = [
  "announcements",
  "design",
  "design-reviews",
  "engineering",
  "general",
  "launches",
  "support",
]

function searchChannels(query: string, { signal }: { signal: AbortSignal }) {
  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        resolve(
          channels.filter((channel) => channel.includes(query.toLowerCase()))
        ),
      400
    )
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

const triggers: TriggerDefinition<string>[] = [
  { char: "@", items: people },
  { char: "/", boundary: "start", items: commands },
  { char: "#", items: searchChannels },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-trigger-menu>
      <ui-field>
        <ui-field-label>Message</ui-field-label>
        <ui-trigger-menu-input>
          <textarea placeholder="Type @, / or #…"></textarea>
        </ui-trigger-menu-input>
      </ui-field>
    </ui-trigger-menu>
  `
  root.querySelector("ui-trigger-menu")!.triggers = triggers
}

export { mount }
