import { createApp, type Component } from "vue"
import { LogKey } from "../shared/vue/log"

let apps = 0

// The docs preview shows logged messages in its console pane.
export function mount(module: { default: Component }, host: HTMLElement) {
  const app = createApp(module.default)
  app.config.idPrefix = `example-${++apps}`
  app.provide(LogKey, (message: string) =>
    host.dispatchEvent(
      new CustomEvent("example-log", { bubbles: true, detail: message })
    )
  )
  app.mount(host)
  return () => app.unmount()
}
