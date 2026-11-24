import { warn } from "@ui-sdk/core/renderer"
import type { SetupContext } from "vue"

type Options = {
  name?: string
  inheritAttrs?: boolean
  props?: Record<string, unknown>
  setup?: (props: Record<string, unknown>, context: SetupContext) => unknown
}

// Once per component and attributes, so a list of 50 tooltips warns once.
const warned = new Set<string>()

function warnAttributes(
  name: string,
  attrs: SetupContext["attrs"],
  read: string[] = []
) {
  const keys = Object.keys(attrs)
    .filter((key) => !read.includes(key))
    .join(", ")
  if (!keys || warned.has(`${name} ${keys}`)) {
    return
  }
  warned.add(`${name} ${keys}`)
  warn(
    `${name} renders no element, so it ignores ${keys}. Put them on one of its parts.`
  )
}

// A part that renders only other parts has no element to give attributes to.
// Vue would hand them to the first part, or warn about a fragment; this drops
// them and says where they go.
function renderless<Component>(component: Component) {
  const options = component as Options
  const setup = options.setup
  options.inheritAttrs = false
  // A root with a `readOnly` prop reads the native `readonly` from its attributes.
  const read = options.props && "readOnly" in options.props ? ["readonly"] : []
  options.setup = (props, context) => {
    warnAttributes(options.name ?? "This root", context.attrs, read)
    return setup?.(props, context)
  }
  return component
}

export { renderless, warnAttributes }
