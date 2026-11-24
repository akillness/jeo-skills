// Inline styles that parts write from `attrs()`, as one `style` attribute, so
// they're in server markup too. Adapters apply them property by property.

/**
 * A `style` attribute from declarations, skipping empty ones.
 * @experimental
 */
function css(declarations: Record<string, string | number | undefined>) {
  let text = ""
  for (const property in declarations) {
    const value = declarations[property]
    if (value !== undefined) {
      text += `${text ? ";" : ""}${property}:${value}`
    }
  }
  return text
}

export { css }
