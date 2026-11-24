import { createSSRApp, type Component } from "vue"
import { renderToString } from "vue/server-renderer"

const examples = import.meta.glob<{ default: Component }>([
  "../*/vue/*.vue",
  "../components/*/vue/*.vue",
])

async function render(module: { default: Component }) {
  const app = createSSRApp(module.default)
  // Without a handler, a setup that throws leaves its component as the
  // current instance, and every later render loses its parts' content.
  let failure: unknown
  app.config.errorHandler = (error) => void (failure ??= error)
  const html = await renderToString(app)
  if (failure) {
    throw failure
  }
  return html
}

export { examples, render }
