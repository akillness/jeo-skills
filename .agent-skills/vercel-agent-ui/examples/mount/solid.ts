import { render } from "@solidjs/web"
import { createComponent, type Component } from "solid-js"
import { LogContext } from "../shared/solid/log"

// The docs preview shows logged messages in its console pane.
export function mount(module: { Example: Component }, host: HTMLElement) {
  const log = (message: string) =>
    host.dispatchEvent(
      new CustomEvent("example-log", { bubbles: true, detail: message })
    )
  return render(
    () =>
      createComponent(LogContext, {
        value: log,
        get children() {
          return createComponent(module.Example, {})
        },
      }),
    host
  )
}
