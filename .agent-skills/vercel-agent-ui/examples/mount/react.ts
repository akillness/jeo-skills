import { createElement, type ComponentType } from "react"
import { LogContext } from "../shared/react/log"

// The docs preview renders this in its own tree, and shows logged messages in
// its console pane.
function ExampleRoot({
  module,
  log,
}: {
  module: { Example: ComponentType }
  log: (message: string) => void
}) {
  return createElement(
    LogContext.Provider,
    { value: log },
    createElement(module.Example)
  )
}

export { ExampleRoot }
