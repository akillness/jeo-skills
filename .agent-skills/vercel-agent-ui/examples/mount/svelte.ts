import { mount as mountComponent, unmount, type Component } from "svelte"
import { LogKey } from "../shared/svelte/log"

// The docs preview shows logged messages in its console pane.
export function mount(module: { default: Component }, host: HTMLElement) {
  const log = (message: string) =>
    host.dispatchEvent(
      new CustomEvent("example-log", { bubbles: true, detail: message })
    )
  const app = mountComponent(module.default, {
    target: host,
    context: new Map([[LogKey, log]]),
  })
  return () => {
    unmount(app)
  }
}
