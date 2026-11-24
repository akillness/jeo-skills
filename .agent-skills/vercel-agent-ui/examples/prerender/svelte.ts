import type { Component } from "svelte"
import { render as renderComponent } from "svelte/server"

const examples = import.meta.glob<{ default: Component }>([
  "../*/svelte/*.svelte",
  "../components/*/svelte/*.svelte",
])

function render(module: { default: Component }) {
  return renderComponent(module.default).body
}

export { examples, render }
