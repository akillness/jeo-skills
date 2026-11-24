import { createElement, type ComponentType } from "react"
import { renderToString } from "react-dom/server"

const examples = import.meta.glob<{ Example: ComponentType }>([
  "../*/react/*.tsx",
  "../components/*/react/*.tsx",
])

function render(module: { Example: ComponentType }) {
  return renderToString(createElement(module.Example))
}

export { examples, render }
