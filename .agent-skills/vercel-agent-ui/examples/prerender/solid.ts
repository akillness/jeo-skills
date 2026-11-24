import { renderToString } from "@solidjs/web"
import { createComponent, type Component } from "solid-js"

const examples = import.meta.glob<{ Example: Component }>([
  "../*/solid/*.tsx",
  "../components/*/solid/*.tsx",
])

function render(module: { Example: Component }) {
  return renderToString(() => createComponent(module.Example, {}))
}

export { examples, render }
