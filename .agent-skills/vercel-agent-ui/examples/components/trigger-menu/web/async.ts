import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"

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
  return new Promise<{ value: string; label: string }[]>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        resolve(
          channels
            .filter((channel) => channel.includes(query.toLowerCase()))
            .map((channel) => ({ value: channel, label: channel }))
        ),
      600
    )
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-trigger-menu>
      <ui-field>
        <ui-field-label>Message</ui-field-label>
        <ui-trigger-menu-input>
          <textarea placeholder="Type # to link a channel…"></textarea>
        </ui-trigger-menu-input>
      </ui-field>
      <ui-trigger-menu-content>
        <ui-trigger-menu-status>Loading channels…</ui-trigger-menu-status>
        <ui-trigger-menu-empty>No channels match “<span></span>”</ui-trigger-menu-empty>
        <ui-trigger-menu-list></ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>
  `
  const menu = root.querySelector("ui-trigger-menu")!
  const status = root.querySelector("ui-trigger-menu-status")!
  const query = root.querySelector("ui-trigger-menu-empty span")!
  const loading = () => {
    status.textContent = "Loading channels…"
  }
  menu.triggers = [
    {
      char: "#",
      type: "channel",
      items: async (text, context) => {
        const items = await searchChannels(text, context)
        status.textContent = items.length
          ? `${items.length} ${items.length === 1 ? "channel" : "channels"}`
          : ""
        return items
      },
    },
  ]
  menu.addEventListener("openchange", (event) => {
    if (event.detail.value) {
      loading()
    }
  })
  menu.addEventListener("querychange", (event) => {
    query.textContent = event.detail.value
    loading()
  })
}

export { mount }
