// What `createParts`' generic part reads from a primitive's schema: a slot's
// props and the element's, ids made for `"id"` props left out, props a nested
// part takes `from` the part around it, and a root's bindable options. Only
// `createParts` pays for it; hand-written parts pass their slot props themselves.
import type { ChangeDetails, Primitive, PropSpec } from "@ui-sdk/core"
import { sameValue, type schemaOf } from "@ui-sdk/core/renderer"
import { getContext, setContext } from "svelte"
import { changeOf } from "../bindable.svelte"
import { useHandle } from "../instance"

type Schema = Record<string, PropSpec>

type ListApi = { internal: { keyOf: (value: unknown) => string } }

// A spec is a kind, a kind with `from`, or a parser function for custom
// elements' attributes, which is never an id here.
const kindOf = (spec: PropSpec) => (typeof spec === "object" ? spec.kind : spec)

/**
 * The element's own props: a component's props without the names the
 * schemas list, and without Svelte's own `$$` props. An `id` stays, and so
 * do attachments, which Svelte passes under symbol keys.
 */
function omitProps(
  props: Record<string | symbol, unknown>,
  ...schemas: Schema[]
) {
  const result: Record<string | symbol, unknown> = {}
  for (const key in props) {
    if (
      !key.startsWith("$$") &&
      (key === "id" || !schemas.some((schema) => key in schema))
    ) {
      result[key] = props[key]
    }
  }
  for (const key of Object.getOwnPropertySymbols(props)) {
    result[key] = props[key]
  }
  return result
}

// The props of the parts around one, by slot, as getters, keyed by the
// primitive's schema, one object for the primitive's life.
type Around = Record<string, () => Record<string, unknown>>

/** What `createParts` binds a generic part to: its primitive and schema, its slot and its tag. */
type PartConfig = {
  primitive: Primitive
  schema: NonNullable<ReturnType<typeof schemaOf>>
  slot: string
  tag?: string
  /** Whether a nested part takes props from this one. */
  provides: boolean
}

/**
 * A slot's props as a getter: those its schema names and the `id`, with
 * `"id"` props left out made from `id`, the part's `$props.id()`, and those
 * it takes `from` another slot filled in from the nearest part of that slot:
 * `"item"` reads the item's prop of the same name, `"group.id"` the group's
 * `id`. A `"key"` prop keys the part by the list's `keyOf`, and a part left
 * outside the part a `required` prop needs throws. A part others take from
 * provides its props to the parts inside it, and a root starts its parts
 * with nothing around them, so a nested root's parts never read an outer
 * one's. Call it in a part's script.
 */
function slotPropsOf(
  { primitive, schema: key, slot, provides }: PartConfig,
  props: Record<string, unknown>,
  id: string
) {
  const schema: Schema = key.slots[slot] ?? {}
  const around =
    slot === "root" ? {} : (getContext<Around | undefined>(key) ?? {})
  for (const spec of Object.values(schema)) {
    const from =
      typeof spec === "object" && spec.required && spec.from.split(".")[0]
    if (from && !around[from]) {
      throw new Error(
        `A ${primitive.name} ${slot} part must be used inside its ${from}.`
      )
    }
  }
  const keyOf = Object.values(schema).some((spec) => kindOf(spec) === "key")
    ? (useHandle(primitive).api as ListApi).internal.keyOf
    : undefined
  const own = () => {
    const result: Record<string, unknown> = { id: props.id }
    for (const name in schema) {
      const spec = schema[name]
      let value = props[name]
      if (value === undefined && typeof spec === "object") {
        const [from, prop = name] = spec.from.split(".")
        value = around[from]?.()[prop]
      }
      if (value === undefined && kindOf(spec) === "id") {
        value = name === "id" ? id : `${id}-${name}`
      }
      result[name] = value
      if (keyOf && kindOf(spec) === "key") {
        result.id ??= keyOf(value)
      }
    }
    return result
  }
  if (provides) {
    setContext<Around>(key, { ...around, [slot]: own })
  } else if (slot === "root") {
    setContext<Around>(key, around)
  }
  return { props: own, schema }
}

/**
 * A root's options as a getter, with `id`. An option with an `on<Key>Change`
 * callback follows Svelte's rule for a `$bindable()` prop: `bind:` writes the
 * change back, and an unbound value changes locally until the parent passes
 * another. `usePrimitive` decides when the parent controls it.
 */
function rootOptions(options: Schema, props: Record<string, any>, id: string) {
  const bindable = Object.keys(options).filter(
    (key) => options[changeOf(key)] === "callback"
  )
  // Values changed locally, with the parent's value each replaced, kept until
  // the parent passes another.
  let local = $state.raw<Record<string, { value: unknown; parent: unknown }>>(
    {}
  )

  const current = (key: string) => {
    const changed = local[key]
    if (changed && sameValue(changed.parent, props[key])) {
      return changed.value
    }
    // Deleted in place: this runs inside a `$derived`, where writing state throws.
    delete local[key]
    return props[key]
  }

  // One callback per bindable option for the root's life.
  const changes = bindable.map(
    (key) => (next: unknown, details: ChangeDetails<string>) => {
      // The callback runs first, so canceling there also keeps a bound value as it was.
      props[changeOf(key)]?.(next, details)
      if (details.canceled) {
        return
      }
      // A bound prop has a setter on the props object, which writes to the parent.
      if (Object.getOwnPropertyDescriptor(props, key)?.set) {
        props[key] = next
      } else {
        local = { ...local, [key]: { value: next, parent: props[key] } }
      }
    }
  )

  return () => {
    const result: Record<string, unknown> & { id: string } = { id }
    for (const key in options) {
      result[key] = props[key]
    }
    bindable.forEach((key, index) => {
      result[key] = current(key)
      result[changeOf(key)] = changes[index]
    })
    return result
  }
}

export { omitProps, type PartConfig, rootOptions, slotPropsOf }
