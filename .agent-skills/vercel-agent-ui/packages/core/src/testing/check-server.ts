// Checks a primitive renders on a server: creating it reads no DOM, clock or
// randomness, and every part's attributes read state alone.
import { parseMarkup, type MarkupNode } from "./markup"
import { slotProps, tagOf } from "./schema"
import { unwatched } from "../foundation/kernel/keep"
import { attrs, partState, present } from "../foundation/kernel/part"
import { schemaOf } from "../foundation/kernel/primitive"
import type {
  OptionsOf,
  Part,
  Primitive,
  SlotName,
} from "../foundation/kernel/primitive-types"

let checked = 0

const stopped = (error: unknown) =>
  (error as Error).message?.endsWith("isn't available on a server.")

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// A style object is written as CSS text.
const cssText = (style: Record<string, unknown>) =>
  Object.entries(style)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
    .map(
      ([property, value]) =>
        `${property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}: ${value}`
    )
    .join("; ")

function toHtml(
  tag: string,
  attributes: Record<string, unknown>,
  children: string
) {
  const { style, ...rest } = attributes
  if (style && typeof style === "object") {
    rest.style = cssText(style as Record<string, unknown>)
  } else if (style !== undefined) {
    rest.style = style
  }
  const written = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([name, value]) =>
      value === true || value === ""
        ? ` ${name}`
        : ` ${name}="${escape(String(value))}"`
    )
    .join("")
  return `<${tag}${written}>${children}</${tag}>`
}

// Runs `read` with the DOM, the clock and randomness unavailable: each read
// is recorded as `what`, and the clock and randomness throw.
function isolated<T>(what: (reading: string) => void, read: () => T) {
  const restores: (() => void)[] = []
  const replace = (
    target: object,
    name: string,
    replacement: PropertyDescriptor
  ) => {
    const saved = Object.getOwnPropertyDescriptor(target, name)
    Object.defineProperty(target, name, { configurable: true, ...replacement })
    restores.push(() =>
      saved
        ? Object.defineProperty(target, name, saved)
        : delete (target as Record<string, unknown>)[name]
    )
  }
  const stop = (name: string) => () => {
    what(`reads the clock or randomness (\`${name}\`)`)
    throw new Error(`${name} isn't available on a server.`)
  }
  const globals = [
    "document",
    "window",
    "navigator",
    "location",
    "localStorage",
    "sessionStorage",
    "matchMedia",
  ]
  // A browser's own `document` and `window` can't be replaced, so there only the rest are hidden.
  for (const name of globals) {
    if (
      Object.getOwnPropertyDescriptor(globalThis, name)?.configurable !== false
    ) {
      replace(globalThis, name, {
        get() {
          what(`reads \`${name}\``)
          return undefined
        },
      })
    }
  }
  replace(Date, "now", { writable: true, value: stop("Date.now") })
  // `new Date()` reads the clock without `Date.now`; a date from a value doesn't.
  const date = new Proxy(Date, {
    apply: stop("Date()"),
    construct: (target, args, newTarget) =>
      args.length
        ? Reflect.construct(target, args, newTarget)
        : stop("new Date()")(),
  })
  replace(globalThis, "Date", { writable: true, value: date })
  if (globalThis.performance) {
    replace(performance, "now", {
      writable: true,
      value: stop("performance.now"),
    })
  }
  replace(Math, "random", { writable: true, value: stop("Math.random") })
  if (globalThis.crypto) {
    for (const name of ["randomUUID", "getRandomValues"]) {
      replace(crypto, name, { writable: true, value: stop(`crypto.${name}`) })
    }
  }
  try {
    return read()
  } finally {
    restores.reverse().forEach((restore) => restore())
  }
}

/**
 * Renders a primitive's parts from markup the way a server does. Checks that
 * creating the instance reads no browser global, clock or randomness, and that
 * each part's attributes, state and presence read none of those nor options.
 * A pass rules out those reads as a cause of server and client HTML differing;
 * it doesn't run a framework's hydration. Markup is `mount`'s. Needs no DOM.
 * Returns the HTML; throws one error that lists every problem.
 *
 * @example
 * const html = checkServer(tabs, { defaultValue: "a" }, `<root><list><tab value="a">A</tab></list></root>`)
 *
 * @experimental
 */
function checkServer<P extends Primitive>(
  primitive: P,
  options: OptionsOf<P>,
  markup: string
) {
  const schema = schemaOf(primitive)
  const id = `server-${++checked}`
  const problems = new Set<string>()
  let rendering = ""
  // Options read while a part renders are recorded, by key.
  const watched = new Proxy({ ...options, id } as Record<string, unknown>, {
    get(target, key) {
      if (rendering && typeof key === "string" && key !== "id") {
        problems.add(`${rendering} reads option \`${key}\``)
      }
      return target[key as string]
    },
  })
  const fail = () =>
    new Error(
      `checkServer found ${problems.size} problem${problems.size === 1 ? "" : "s"}:\n- ${[...problems].join("\n- ")}`
    )
  // Made unwatched, as on a server: watching it reads `document`, and nothing
  // should hear an instance that only renders HTML.
  const instance = isolated(
    (what) => problems.add(`creating it ${what}`),
    () => {
      try {
        return unwatched(() => primitive(watched as never))
      } catch (error) {
        throw stopped(error) ? fail() : error
      }
    }
  )
  let count = 0

  // check-code: allow return-type it calls itself, so TypeScript can't infer it.
  function render(
    node: MarkupNode | string,
    around: Record<string, Record<string, unknown>>
  ): string {
    if (typeof node === "string") {
      return escape(node)
    }
    const own = schema.slots[node.tag]
    if (!own) {
      const inner = node.children.map((child) => render(child, around)).join("")
      return toHtml(node.tag, Object.fromEntries(node.attributes), inner)
    }
    const slot = node.tag
    const { props, extra, as } = slotProps(
      own,
      node.attributes,
      around,
      () => `${id}-${slot}-${count++}`
    )
    const part = instance.part(slot as SlotName<P>, props as never) as Part
    rendering = `\`${slot}\`${part.key ? ` "${part.key}"` : ""}`
    const report = (what: string) => problems.add(`${rendering} ${what}`)
    const view = isolated(report, () => {
      try {
        return {
          attributes: attrs(part),
          shown: present(part),
          state: partState(part),
        }
      } catch (error) {
        // A read this check stopped was reported already; render on, so parts inside are checked too.
        if (!stopped(error)) {
          report(`throws while rendering: ${(error as Error).message}`)
        }
        return { attributes: {}, shown: true, state: {} }
      }
    })
    rendering = ""
    if (!view.shown) {
      return ""
    }
    const inner = node.children
      .map((child) => render(child, { ...around, [slot]: props }))
      .join("")
    return toHtml(
      as ?? tagOf(view.attributes),
      { ...Object.fromEntries(extra), ...view.attributes },
      inner
    )
  }

  const html = parseMarkup(markup)
    .map((node) => render(node, {}))
    .join("")
  instance.destroy()
  if (problems.size) {
    throw fail()
  }
  return html
}

export { checkServer }
