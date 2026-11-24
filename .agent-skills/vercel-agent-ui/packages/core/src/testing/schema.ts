// Reading a primitive's schema the way renderers do: a prop's kind, where a
// prop left out comes from, and a slot's props from markup attributes.
import type { PropSpec } from "../foundation/kernel/primitive-types"

// A parser function reads an attribute no kind fits, so its value is any value.
const kindOf = (spec: PropSpec) =>
  typeof spec === "function"
    ? "value"
    : typeof spec === "object"
      ? spec.kind
      : spec

// `"group.id"` names the parent slot and its prop; `"item"` leaves the prop to the prop's own name.
function fromOf(spec: PropSpec, key: string) {
  if (typeof spec !== "object") {
    return undefined
  }
  const [slot, prop = key] = spec.from.split(".")
  return { slot, prop }
}

// Parses a slot prop's attribute by its kind. `"value"` props read JSON, so
// markup can pass an array or an object.
function parseProp(spec: PropSpec, attribute: string) {
  if (typeof spec === "function") {
    return spec(attribute)
  }
  const kind = kindOf(spec)
  if (kind === "boolean") {
    return attribute !== "false"
  }
  if (kind === "number") {
    return Number(attribute)
  }
  if (kind === "list") {
    return attribute ? attribute.split(",").map((item) => item.trim()) : []
  }
  if (kind === "value") {
    try {
      return JSON.parse(attribute)
    } catch {
      return attribute
    }
  }
  return attribute
}

const camel = (name: string) =>
  name.replace(/-(\w)/g, (_, char: string) => char.toUpperCase())

/**
 * A slot's props from its markup attributes, parsed by the slot's schema,
 * with those left out taken from the parts around it (`around`, by slot) or
 * made unique (`makeId`). Other attributes stay on the element, and `as`
 * names its tag.
 */
function slotProps(
  own: Record<string, PropSpec>,
  attributes: [name: string, value: string][],
  around: Record<string, Record<string, unknown>>,
  makeId: () => string
) {
  const props: Record<string, unknown> = {}
  const extra: [name: string, value: string][] = []
  let as: string | undefined
  for (const [name, value] of attributes) {
    const key = camel(name)
    if (name === "as") {
      as = value
    } else if (key in own) {
      props[key] = parseProp(own[key], value)
    } else {
      extra.push([name, value])
    }
  }
  for (const key in own) {
    const from = fromOf(own[key], key)
    if (from) {
      props[key] ??= around[from.slot]?.[from.prop]
    }
    if (kindOf(own[key]) === "id") {
      props[key] ??= makeId()
    }
  }
  return { props, extra, as }
}

// The tag a part renders, unless the markup names one with `as`: a button for
// a slot whose attributes make it one, a link for one with an `href`, and so on.
function tagOf(rendered: Record<string, unknown>) {
  if (rendered.type === "button" || rendered.type === "submit") {
    return "button"
  }
  if (rendered.href !== undefined) {
    return "a"
  }
  if (rendered.for !== undefined) {
    return "label"
  }
  if (typeof rendered.type === "string") {
    return "input"
  }
  return "div"
}

export { camel, fromOf, kindOf, slotProps, tagOf }
