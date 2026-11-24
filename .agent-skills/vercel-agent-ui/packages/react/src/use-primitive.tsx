import type {
  Attrs,
  OptionsOf,
  Part,
  Primitive,
  PrimitiveInstance,
  PropSpec,
  PropsOf,
  SlotName,
  StateOf,
  TypesOf,
} from "@ui-sdk/core"
import {
  attrs,
  commit,
  directNames,
  handlers as partHandlers,
  keep,
  partState,
  present,
  ref,
  release,
  renderVersion,
  runBindWrites,
  sameSlotState,
  sameValue,
  schemaOf,
  selectedKeys,
  subscribe,
  takeOwnId,
  unwatched,
  yieldToAuthor,
  type PrimitiveGeneric,
} from "@ui-sdk/core/renderer"
import * as React from "react"
import {
  mergeProps,
  mergeRefs,
  renderElement,
  resolveLazy,
  type RenderProp,
} from "./render-element"

// Names React spells in camel case, by their lowercase DOM name, like
// `tabindex: "tabIndex"`, with `prefix` before each.
const camelCase = (names: string, prefix = "") =>
  Object.fromEntries(
    names.split(" ").map((name) => [name.toLowerCase(), prefix + name])
  )

// The attribute translations React needs: names it spells in camel case, and
// the `checked` attribute, which is the default checkedness in HTML and which
// React calls defaultChecked.
const propNames: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  checked: "defaultChecked",
  .../* @__PURE__ */ camelCase(
    "tabIndex readOnly inputMode enterKeyHint autoComplete autoCapitalize autoCorrect spellCheck contentEditable maxLength minLength"
  ),
}
const booleans = new Set([
  "hidden",
  "disabled",
  "readonly",
  "required",
  "inert",
  "checked",
  "multiple",
])

// "position:absolute;margin:-1px" becomes { position: "absolute", margin: "-1px" }.
// Parts render the same few styles again and again, so each text is parsed
// once. React only reads the objects. The cache empties when it fills, since
// a drag writes a new position on every move.
const styles = new Map<string, Record<string, string>>()

function styleObject(css: string) {
  let style = styles.get(css)
  if (style) {
    return style
  }
  style = {}
  for (const declaration of css.split(";")) {
    const index = declaration.indexOf(":")
    if (index === -1) {
      continue
    }
    const name = declaration.slice(0, index).trim()
    style[
      name.startsWith("--")
        ? name
        : name.replace(/-(\w)/g, (_, char: string) => char.toUpperCase())
    ] = declaration.slice(index + 1).trim()
  }
  if (styles.size >= 500) {
    styles.clear()
  }
  styles.set(css, style)
  return style
}

// DOM event names to React prop names. React's onChange fires on every
// input, like the DOM's input event.
const eventProps: Record<string, string> = /* @__PURE__ */ Object.assign(
  /* @__PURE__ */ camelCase(
    "Click KeyDown KeyUp ContextMenu PointerDown MouseDown PointerUp PointerMove",
    "on"
  ),
  {
    dblclick: "onDoubleClick",
    focusin: "onFocus",
    focusout: "onBlur",
    input: "onChange",
    submit: "onSubmit",
  }
)

// Every other type is the element's own listener, which core attaches, so a
// slot's `on.focus` or `on.wheel` works like `on.keydown`. That includes
// pointerenter and pointerleave. React fires onPointerEnter and onPointerLeave
// while it handles the pointerout or pointerover before them, and passes that
// event as nativeEvent, so moving straight from one trigger to the next, its
// target is the trigger the pointer left. Core hears the real events, as in
// Vue and web components. A user's React handler can't skip these with
// preventDefault(), since core doesn't wait for it.
const host = {
  by: "framework",
  attaches: /* @__PURE__ */ Object.keys(eventProps),
} as const

function toReactProps(attrs: Attrs) {
  const props: Record<string, unknown> = {}
  for (const name in attrs) {
    const value = attrs[name]
    if (value === undefined) {
      continue
    }
    props[propNames[name] ?? name] = booleans.has(name)
      ? true
      : name === "style"
        ? styleObject(value)
        : value
  }
  return props
}

/**
 * What `usePrimitive` returns, and what a component's context holds: one object for the instance's life.
 * @stable
 */
type PrimitiveHandle<P extends Primitive> = {
  /** The primitive it's an instance of. */
  primitive: P
  /** The core instance `usePrimitive` made, with its `get()`, `part()` and `api`. In render, read `state` instead of its `get()`, which shows only what React has committed. */
  instance: ReturnType<P>
  /** The state this render shows. Reading it doesn't subscribe; a part's `render` and class name functions get the state they render. */
  readonly state: TypesOf<P>["state"]
  /** The methods its definition declares, like Tabs' `setValue`. */
  api: TypesOf<P>["api"]
}

/**
 * Creates an instance of a primitive for this component, keeps its options
 * current on every render, and destroys it when the component leaves. Render
 * its root with `usePart`, which shares the instance with the parts inside.
 *
 * @example
 * function ConfirmButton({ onConfirm, ...props }: PartProps<"button", ConfirmButtonState> & { onConfirm?: () => void }) {
 *   const button = usePrimitive(confirmButton, { onConfirm })
 *   return usePart(button, "root", {}, props, "button")
 * }
 * @stable
 */
function usePrimitive<P extends Primitive>(
  primitive: P,
  options: OptionsOf<P>
) {
  // Prefixed so a page using ui-sdk is recognizable from its HTML. Part ids
  // stay unprefixed, since some are keys, like saved resizable layouts.
  const id = `ui-sdk-${React.useId()}`
  // Without its controller until it commits, so a render React throws away,
  // like a transition that suspended, never takes the controller from the
  // instance on the page.
  const create = (from: object = {}) =>
    unwatched(
      () =>
        primitive({
          ...options,
          ...from,
          controller: undefined,
          id,
        }) as ReturnType<P>
    )
  // Kept once React commits it: only then do the agent and `observe` hear
  // it, its controller attach and its work outside itself start, so
  // StrictMode's second initializer call, which React throws away, never does.
  const [instance, setInstance] = React.useState(() => create())
  React.useLayoutEffect(() => keep(instance), [instance])

  // The state this render's options make, while the instance doesn't have
  // them yet: a transition renders the new value, and React keeps showing the
  // old one until it's ready, as with plain state. Options that read another
  // instance, like a toggle's group, read it as this render shows it too.
  const next = { ...options, id }
  const outers = outersOf(options)
  const base = instance.get()
  const state = within(outers, () => instance.preview(next))
  const preview: Preview | undefined = state && {
    options: next,
    outers,
    base,
    state,
    handed: false,
    pending: new Set(),
  }

  // Keeps callbacks fresh and syncs controlled options. From here the
  // instance has what the preview showed.
  React.useLayoutEffect(() => {
    handOver(instance, next, preview, outers)
  })

  // Hidden or gone, the instance lets go of what it holds outside itself,
  // like its controller, and keeps its state for <Activity> showing it again.
  // A microtask later, so StrictMode's unmount and remount in one go doesn't
  // count, and a passive effect, so Suspense hiding the component keeps even
  // that. React tells hiding from removing only through the page: with an
  // element there, the instance is destroyed once that element leaves,
  // settling a pending controller `open()`; without one, once React lets go
  // of the component.
  const life = React.useRef({ mounted: 0, destroyed: false })
  React.useEffect(() => {
    const own = life.current
    own.mounted++
    hidden.delete(instance)
    owners?.unregister(own)
    // Its element left while it was hidden, so a new instance starts where it was.
    if (own.destroyed) {
      own.destroyed = false
      setInstance(create(carried(primitive, instance, options)))
    }
    return () => {
      own.mounted--
      queueMicrotask(() => {
        if (own.mounted || own.destroyed) {
          return
        }
        release(instance)
        const leave = () => {
          own.destroyed = true
          instance.destroy()
        }
        if (!anchors.has(instance)) {
          owners?.register(own, instance, own)
        } else if (inPage(instance)) {
          hide(instance, leave)
        } else {
          leave()
        }
      })
    }
  }, [instance])

  // Once every part in the commit bound, StrictMode's rebinds too: their store
  // writes land before a synchronous `act()` returns, so it leaves none for after.
  React.useEffect(() => runBindWrites())

  // One object for the instance's life, so context consumers never re-render
  // because of it. Parts subscribe to what they render through usePart.
  const stable = React.useMemo(() => {
    const handle: PrimitiveHandle<P> = {
      primitive,
      instance,
      get state() {
        return stateIn(this)
      },
      // Read when used, since reading it wakes an asleep instance.
      get api() {
        return instance.api as TypesOf<P>["api"]
      },
    }
    return handle
  }, [instance])

  if (!preview) {
    return stable
  }
  const previewing = extendHandle(stable, {})
  previews.set(previewing, preview)
  return previewing
}

// A render's options the instance doesn't have yet, the handles of the
// instances they read, the state they make over `base`, the instance's state
// they were last applied to, and the parts that rendered with them and
// haven't committed yet. `handed` once the render commits and hands the
// options over.
type Preview = {
  options: object
  outers: Outer[] | undefined
  base: object
  state: object | undefined
  handed: boolean
  pending: Set<object>
}

// Each previewing handle's preview, kept off the handle so its public type
// shows only what consumers read.
const previews = new WeakMap<object, Preview>()

// The preview whose options are being handed over right now. Its pending
// parts skip the change that makes, since each commits right after and
// checks then. A root's own part commits after the root, so it would
// otherwise render twice for every new option.
let handing: Preview | undefined

// Hands a render's options over as it commits. The instances they read, like
// a toggle's group, commit after it, since children commit first, so the
// options read them as the render showed them.
function handOver(
  instance: PrimitiveInstance,
  options: object,
  preview: Preview | undefined,
  outers: Outer[] | undefined
) {
  if (preview) {
    preview.handed = true
  }
  const outer = handing
  handing = preview
  try {
    within(outers, () => instance.setOptions(options))
  } finally {
    handing = outer
  }
}

// A handle of an instance another primitive's options read.
type Outer = { instance: PrimitiveInstance }

// Option values that read another instance, by the handle of the render
// that made them.
const readers = new WeakMap<object, Outer>()

// Marks `read`, an option that reads `handle`'s instance, like a toggle's
// `group`. The primitive it's passed to renders and takes its options
// reading that instance as `handle`'s render shows it, so a group's new
// value reaches its items in the render that changes it.
function reading<F extends (...args: never[]) => unknown>(
  handle: Outer,
  read: F
) {
  readers.set(read, handle)
  return read
}

// The handles of the instances `options` read.
function outersOf(options: Record<string, unknown>) {
  let outers: Outer[] | undefined
  for (const key in options) {
    const outer = readers.get(options[key] as object)
    if (outer) {
      ;(outers ??= []).push(outer)
    }
  }
  return outers
}

// Runs `read` with each instance in `outers` reading as its render shows it.
function within<T>(outers: Outer[] | undefined, read: () => T) {
  if (!outers) {
    return read()
  }
  let run = read
  for (const outer of outers) {
    const inner = run
    run = () => readIn(outer, inner)
  }
  return run()
}

// A copy of a handle with `extra` keys, like a context that adds the field
// around it. A plain spread would freeze `state` and lose the preview, and
// read `api`, which wakes an asleep instance.
function extendHandle<
  H extends { instance: PrimitiveInstance },
  E extends object,
>(handle: H, extra: E) {
  const copy: H & E = Object.defineProperties({} as H & E, {
    ...Object.getOwnPropertyDescriptors(handle),
    ...Object.getOwnPropertyDescriptors(extra),
    state: { get: () => stateIn(copy), enumerable: true },
  })
  const preview = previews.get(handle)
  if (preview) {
    previews.set(copy, preview)
  }
  return copy
}

// Whether a slot's element should exist, as the handle's render shows it.
// For this package's own markup: a custom part renders through `usePart`,
// which waits for the commit.
function presentIn<P extends Primitive, S extends SlotName<P>>(
  handle: PrimitiveHandle<P>,
  name: S,
  props?: PropsOf<P, S>
) {
  const part = handle.instance.part(name, props)
  return readIn(handle, (showing) => present(part, part.props, showing))
}

// Props for a slot's element, as the handle's render shows them, merged with
// the user's props, whose handlers run first. For this package's own markup.
function slotIn<P extends Primitive, S extends SlotName<P>>(
  handle: PrimitiveHandle<P>,
  name: S,
  props?: PropsOf<P, S>,
  user: Record<string, any> = {}
) {
  const part = handle.instance.part(name, props)
  return readIn(handle, (showing) =>
    elementProps(part, part.props, user, showing)
  ) as Record<string, any>
}

// The state a handle's render shows: its preview until it's handed over, made
// again whenever the instance's state moves on, like a resizable measuring
// its panels, so it never shows state older than the instance's, and options
// still waiting for a commit land on the newest state.
function stateIn<I extends PrimitiveInstance>(handle: { instance: I }) {
  const { instance } = handle
  const current = instance.get()
  const preview = previews.get(handle)
  if (!preview || preview.handed) {
    return current as I["types"]["state"]
  }
  if (preview.base !== current) {
    preview.base = current
    preview.state = within(preview.outers, () =>
      instance.preview(preview.options)
    )
  }
  return (preview.state ?? current) as I["types"]["state"]
}

// Reads what a handle's render shows, given its state, with the api reading
// that state too, like a list's items or a slot's selected item, since the
// api reads the instance's own. The api reads the parts in `around` with the
// props this render gives them, like a radio group's new value.
function readIn<I extends PrimitiveInstance, T>(
  handle: { instance: I },
  read: (state: I["types"]["state"]) => T,
  around?: Record<string, object>
) {
  const state = stateIn(handle)
  if (state === handle.instance.get() && !around) {
    return read(state)
  }
  return handle.instance.view(state, () => read(state), around)
}

// One element of each instance's that's in the page, as its parts commit.
// React keeps it there while hiding a component, and removes it with it.
const anchors = new WeakMap<PrimitiveInstance, Element>()
const inPage = (instance: PrimitiveInstance) =>
  !!anchors.get(instance)?.isConnected

// Destroys an instance hidden or gone without an element in the page once
// React lets go of the component that made it, whose `life` ref goes with it.
const owners =
  typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry<PrimitiveInstance>((instance) =>
        instance.destroy()
      )

// Instances hidden with an element in the page, each with how it leaves once
// that element does, like a hidden `<Activity>` removed with it.
const hidden = new Map<PrimitiveInstance, () => void>()
let sweeping: ReturnType<typeof setInterval> | undefined

function hide(instance: PrimitiveInstance, leave: () => void) {
  hidden.set(instance, leave)
  sweeping ??= setInterval(() => {
    for (const [instance, leave] of hidden) {
      if (inPage(instance)) {
        continue
      }
      hidden.delete(instance)
      leave()
    }
    if (hidden.size) {
      return
    }
    clearInterval(sweeping)
    sweeping = undefined
  }, 1000)
}

// A destroyed instance's state, as the defaults a new one starts from, for
// each option with a default the parent didn't control.
function carried(
  primitive: Primitive,
  instance: PrimitiveInstance,
  options: Record<string, any>
) {
  const schema = schemaOf(primitive).options
  const state = instance.get() as Record<string, unknown>
  const defaults: Record<string, unknown> = {}
  for (const key in state) {
    const fallback = `default${key[0].toUpperCase()}${key.slice(1)}`
    if (fallback in schema && options[key] === undefined) {
      defaults[fallback] = state[key]
    }
  }
  return defaults
}

const heldRefs = new WeakMap<Part, (el: HTMLElement | null) => void>()

// React detaches and attaches an element again when its ref changes, like an
// inline callback ref the app passes, so a part lets go of its element a
// microtask later, unless it attached again by then.
function heldRef(part: Part) {
  let held = heldRefs.get(part)
  if (held) {
    return held
  }
  const bindTo = ref(part, host)
  let releasing = false
  held = (el) => {
    releasing = !el
    if (el) {
      return bindTo(el)
    }
    queueMicrotask(() => {
      if (releasing) {
        bindTo(null)
      }
    })
  }
  heldRefs.set(part, held)
  return held
}

// The slot's attributes win over the user's props, but for an `id` and what
// `yieldToAuthor` leaves to the user. The user's handlers run first and can
// call preventDefault() to skip the built-in behavior.
function elementProps(
  part: Part,
  props: unknown,
  user: Record<string, any>,
  state: object
) {
  takeOwnId(part, user.id)
  const handlers: Record<string, (event: React.SyntheticEvent) => void> = {}
  for (const [type, handler] of Object.entries(partHandlers(part))) {
    const prop = eventProps[type]
    if (!prop) {
      continue
    }
    handlers[prop] = (event) => {
      handler!(event.nativeEvent)
      // A handler that ran after ours, like a router link's own onClick, reads React's event.
      if (event.nativeEvent.defaultPrevented && !event.isDefaultPrevented()) {
        event.preventDefault()
      }
    }
  }
  const own = yieldToAuthor(
    attrs(part, props as never, state),
    (name) => user[propNames[name] ?? name] != null
  )
  return mergeProps(handlers, user, toReactProps(own), {
    id: user.id,
    ref: heldRef(part),
  })
}

/**
 * Props every part takes: its element's props, `render`, and class names and
 * styles that may be functions of the part's state.
 * @stable
 */
type PartProps<
  Tag extends keyof React.JSX.IntrinsicElements,
  State = {},
> = Omit<React.ComponentProps<Tag>, "className" | "style" | "children"> & {
  /** Class names, or a function of the part's state that returns them. */
  className?: string | ((state: State) => string | undefined)
  /** Styles, or a function of the part's state that returns them. */
  style?:
    React.CSSProperties | ((state: State) => React.CSSProperties | undefined)
  /** Renders your own element: one that receives the part's props, or a function of the props and the state. */
  render?: RenderProp<State>
  /** Content, or a function of the part's state that returns it. */
  children?: React.ReactNode | ((state: State) => React.ReactNode)
}

// Attributes in `skip` may differ.
function sameAttrs(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  skip: readonly string[] = []
) {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key] || skip.includes(key))
  )
}

// Each instance's mounted parts, to check again when a part commits new values.
const rechecks = new WeakMap<PrimitiveInstance, Set<() => void>>()

// Whether committing `after` changes a value other parts may read. Callbacks
// are new on most renders, so a new one doesn't count.
function changesValues(
  before: Record<string, unknown>,
  after: Record<string, unknown>
) {
  for (const key in { ...before, ...after }) {
    if (typeof before[key] === "function" && typeof after[key] === "function") {
      continue
    }
    if (!sameValue(before[key], after[key])) {
      return true
    }
  }
  return false
}

/**
 * A part's state for `render` and state-based class names, and its
 * subscription to the instance. A part re-renders only when its attributes or
 * presence change, or a state key its render function read changes. Live
 * state, like the highlighted item, changes no attributes, so parts that never
 * read it never re-render for it. Core writes a slot's `direct` attributes to
 * the element itself, so a change to only those re-renders nothing either.
 */
function usePartState<P extends Primitive, S extends SlotName<P>>(
  handle: Pick<PrimitiveHandle<P>, "instance">,
  name: S,
  props: PropsOf<P, S>,
  around?: Record<string, object>
) {
  const { instance } = handle
  const [, rerender] = React.useReducer((count: number) => count + 1, 0)
  // Rendering may be thrown away, so the part's props take effect, for its
  // handlers and its `onProps` work, once React commits them.
  const part = instance.part(name, props, true)
  const rendered = readIn(
    handle,
    (showing) => ({
      handle,
      around,
      props,
      snapshot: partState(part, props, showing) as StateOf<P, S> &
        Record<string, unknown>,
      // The keys this render read, filled in as it reads them.
      read: new Set<string>(),
      attrs: attrs(part, props, showing),
      present: present(part, props, showing),
      version: renderVersion(instance),
    }),
    around
  )
  const state = new Proxy(rendered.snapshot, {
    get(target, key) {
      if (typeof key === "string") {
        rendered.read.add(key)
      }
      return target[key as string]
    },
  })

  // What the last committed render showed. The listener compares it with
  // what that render's handle and the parts around it show now, so the part
  // subscribes once, not on every render, and a render and its check never
  // disagree. It reads with the committed props, not those of a render React
  // may have discarded since.
  const last = React.useRef(rendered)
  const preview = previews.get(handle)
  if (preview && !preview.handed) {
    preview.pending.add(last)
  }
  // `full` compares the attributes core writes itself too, after a commit,
  // whose render may have read state older than what core last wrote, and
  // `props` compares them though the state didn't change, after another
  // part's props did.
  const check = React.useCallback(
    (full: boolean, props = false) => {
      const shown = last.current
      const outdated = readIn(
        shown.handle,
        (now) => {
          if (shown.read.size) {
            const next = partState(
              part,
              shown.props,
              now
            ) as typeof shown.snapshot
            for (const key of shown.read) {
              if (sameSlotState(next[key], shown.snapshot[key])) {
                continue
              }
              shown.snapshot = next
              return true
            }
          }
          // Presence may read live state, which changes no version, so it is
          // checked on every change.
          const shows = present(part, shown.props, now)
          if (shows !== shown.present) {
            return true
          }
          if (renderVersion(instance) === shown.version && !props) {
            return false
          }
          shown.version = renderVersion(instance)
          // A part that isn't in the page has no attributes to keep current,
          // like a closed popup's content learning its trigger's id.
          return (
            shows &&
            !sameAttrs(
              attrs(part, shown.props, now),
              shown.attrs,
              full ? undefined : directNames(part)
            )
          )
        },
        shown.around
      )
      if (outdated) {
        rerender()
      }
    },
    [instance, part]
  )

  React.useLayoutEffect(() => {
    const changed = part.props !== props && changesValues(part.props, props)
    commit(part, props)
    preview?.pending.delete(last)
    if (part.el && !inPage(instance)) {
      anchors.set(instance, part.el)
    }
    last.current = rendered
    // Changes between the render and now, like another part binding, count too.
    check(true)
    // Children commit first, and so do parts elsewhere that read this one's
    // committed props, which check again now.
    if (changed) {
      rechecks.get(instance)?.forEach((recheck) => recheck())
    }
  })

  // A new key is a new part, and a new value the part selects on needs a new subscription.
  const selected = selectedKeys(part, props)
  React.useLayoutEffect(() => {
    const recheck = () => check(true, true)
    let all = rechecks.get(instance)
    if (!all) {
      rechecks.set(instance, (all = new Set()))
    }
    all.add(recheck)
    const unsubscribe = subscribe(
      part,
      () => {
        if (!handing?.pending.has(last)) {
          check(false)
        }
      },
      last.current.props
    )
    return () => {
      all.delete(recheck)
      unsubscribe()
    }
  }, [part, selected, check])

  return state as StateOf<P, S>
}

// A list's api, whose items' values key their parts.
type ListApi = { internal: { keyOf: (value: unknown) => string } }

const kindOf = (spec: PropSpec) => (typeof spec === "object" ? spec.kind : spec)

// Where a prop comes from when it's left out: the slot, and that slot's prop,
// which `"group.id"` names and `"item"` leaves to the prop's own name.
const fromOf = (spec: PropSpec, key: string) => {
  if (typeof spec !== "object") {
    return undefined
  }
  const [slot, prop = key] = spec.from.split(".")
  return { slot, prop }
}

// "tab-icon" is "TabIcon".
const pascal = (name: string) =>
  name.replace(/(^|-)(\w)/g, (_, _dash, char: string) => char.toUpperCase())

// Splits a component's props into those the schema names and the element's own.
function split(props: Record<string, any>, schema: Record<string, PropSpec>) {
  const named: Record<string, any> = {}
  const rest: Record<string, any> = {}
  for (const key in props) {
    ;(key in schema ? named : rest)[key] = props[key]
  }
  return [named, rest] as const
}

// Each primitive's parts share one context: the instance, and the props of the
// parts around the one rendering, by slot, for props a nested part takes from
// its parent, like a handle's item `value`. `shown` has the same parts' props
// as they render, before React commits them, which the api reads inside them,
// like a radio item its group's value. `provides` holds the slots whose props
// a nested part takes, which `createParts` fills in from the schema, so a
// component written by hand bundles no schema reading.
type Scope = {
  handle: PrimitiveHandle<Primitive>
  around: Record<string, Record<string, unknown>>
  shown?: Record<string, object>
}
type Scopes = {
  context: React.Context<Scope | null>
  provides: Set<string>
  keyed: Set<string>
}
const scopes = new WeakMap<Primitive, Scopes>()
function scopeOf(primitive: Primitive) {
  let scope = scopes.get(primitive)
  if (!scope) {
    scopes.set(
      primitive,
      (scope = {
        context: React.createContext<Scope | null>(null),
        provides: new Set(),
        keyed: new Set(),
      })
    )
  }
  return scope
}

/**
 * Shares an instance with the parts inside, for a root that renders no
 * element of its own, like a popover's.
 */
function HandleScope({
  handle,
  children,
}: {
  handle: PrimitiveHandle<Primitive>
  children?: React.ReactNode
}) {
  const { context } = scopeOf(handle.primitive)
  const scope = React.useMemo(() => ({ handle, around: {} }), [handle])
  return <context.Provider value={scope}>{children}</context.Provider>
}

/** The nearest instance of a primitive, or undefined outside its root, like a toggle's group. */
function useNearest<P extends Primitive>(primitive: P) {
  return React.useContext(scopeOf(primitive).context)?.handle as
    PrimitiveHandle<P> | undefined
}

/** The nearest instance of a primitive, for a part written by hand that calls its api. */
function useHandle<P extends Primitive>(primitive: P) {
  const handle = useNearest(primitive)
  if (!handle) {
    throw new Error(
      `The ${primitive.name} parts must be used inside their root.`
    )
  }
  return handle
}

// A slot's state, or none for a slot that hands render functions nothing.
type PartState<P extends Primitive, S extends SlotName<P>> =
  unknown extends StateOf<P, S> ? {} : StateOf<P, S>

/**
 * Renders one part of a primitive written by hand: its element, with the
 * slot's attributes and handlers merged into `props`, re-rendered when what
 * it shows changes, or nothing while the slot says it isn't present.
 * `handle` is `usePrimitive`'s, or the primitive, whose nearest instance it
 * uses. Given `usePrimitive`'s handle, the parts inside the element find that
 * instance.
 *
 * @example
 * function RatingStar({ value, ...props }: PartProps<"button", RatingStarState> & { value: string }) {
 *   return usePart(rating, "star", { value }, props, "button")
 * }
 * @stable
 */
function usePart<
  P extends Primitive,
  S extends SlotName<P>,
  T extends Tag = "div",
>(
  handle: P | PrimitiveHandle<P>,
  slot: S,
  slotProps: PropsOf<P, S>,
  props: PartProps<T, PartState<P, S>> = {} as PartProps<T, PartState<P, S>>,
  tag = "div" as T
) {
  const primitive = typeof handle === "function" ? handle : handle.primitive
  const { context, provides, keyed } = scopeOf(primitive)
  const scope = React.useContext(context)
  const owner = (
    typeof handle === "function" ? scope?.handle : handle
  ) as PrimitiveHandle<Primitive>
  if (!owner) {
    throw new Error(
      `The ${primitive.name} ${slot} part must be used inside its root.`
    )
  }
  const { render, ...rest } = props
  // An instance a part renders with its handle, like a root's, reaches the parts inside it.
  const own = React.useMemo<Scope>(
    () => ({ handle: owner, around: {} }),
    [owner]
  )
  const inside = scope?.handle === owner ? scope : own
  // The parts inside a keyed item take its key as its value, as every adapter's do.
  const around = keyed.has(slot)
    ? { ...slotProps, value: (slotProps as { id?: string }).id }
    : slotProps
  const provided: Scope = provides.has(slot)
    ? {
        handle: owner,
        around: { ...inside.around, [slot]: around },
        shown: { ...inside.shown, [slot]: slotProps as object },
      }
    : inside
  const state = usePartState(
    owner,
    slot as never,
    slotProps as never,
    provided.shown
  )
  // A part that shouldn't be in the page, like an unselected tab's panel, renders nothing.
  const part = owner.instance.part(slot, slotProps, true)
  // Removed with its component, a part lets go in this commit, not a microtask later.
  React.useLayoutEffect(() => () => ref(part, host)(null), [part])
  const merged = readIn(
    owner,
    (showing) => {
      if (!present(part, slotProps, showing)) {
        return undefined
      }
      // An id on a `render` element wins its merge, so the part takes that one
      // as it renders. A render function's can't be read until it runs.
      const rendered = resolveLazy(render)
      const renderId = React.isValidElement<{ id?: string }>(rendered)
        ? rendered.props.id
        : undefined
      const user = renderId === undefined ? rest : { ...rest, id: renderId }
      return elementProps(part, slotProps, user, showing)
    },
    provided.shown
  )
  const element = merged ? renderElement(tag, merged, render, state) : null
  if (provided === scope) {
    return element
  }
  return <context.Provider value={provided}>{element}</context.Provider>
}

// "tab-icon" is `TabIcon`.
type Pascal<Name extends string> = Name extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${Pascal<Tail>}`
  : Capitalize<Name>

type Tag = keyof React.JSX.IntrinsicElements

// A part's element props, without the ones its slot or options name.
type ElementProps<T extends Tag, State, Named> = Omit<
  PartProps<T, State>,
  keyof Named
>

// A part's props: what its slot and, for a root, the options name, and its element's.
type Props<Named, State, T extends Tag> = Named & ElementProps<T, State, Named>

type RootSlot<P extends Primitive> = "root" & SlotName<P>

// A generic primitive's types for parameters `T` and `U`, or the primitive's own without one.
type GenericOf<P> = P extends { generic?: infer G extends PrimitiveGeneric }
  ? G
  : never
type Applied<G, T, U> = G & { T: T; U: U }
type DefaultOf<G extends PrimitiveGeneric, K extends "T" | "U"> = G extends {
  defaults: Record<K, infer D>
}
  ? D & G[K]
  : G[K]
// A generic's options never include `id`, and an `Omit` there would stop
// TypeScript inferring its parameters. A primitive without parameters
// (`never`) gets its own types.
type OptionsIn<P extends Primitive, A> = [A] extends [never]
  ? OptionsOf<P>
  : A extends { options: infer O }
    ? O
    : OptionsOf<P>
type StateIn<P extends Primitive, S extends SlotName<P>, A> = [A] extends [
  never,
]
  ? StateOf<P, S>
  : A extends { state: Record<S, infer State> }
    ? State
    : StateOf<P, S>
type PropsIn<P extends Primitive, S extends SlotName<P>, A> = [A] extends [
  never,
]
  ? PropsOf<P, S>
  : A extends { props: Record<S, infer Named> }
    ? Named
    : PropsOf<P, S>

// The root's component: generic over the primitive's parameters when it has them.
type RootOf<P extends Primitive, T extends Tag | undefined> = [
  GenericOf<P>,
] extends [never]
  ? (props: RootPropsIn<P, never, T>) => React.ReactElement | null
  : <
      A extends GenericOf<P>["T"] = DefaultOf<GenericOf<P>, "T">,
      B extends GenericOf<P>["U"] = DefaultOf<GenericOf<P>, "U">,
    >(
      props: GenericRootProps<P, Applied<GenericOf<P>, A, B>, T>
    ) => React.ReactElement | null
// Indexed, not matched with a conditional, so TypeScript infers the parameters from the props.
type GenericRootProps<
  P extends Primitive,
  A extends PrimitiveGeneric,
  T extends Tag | undefined,
> = T extends Tag
  ? Props<A["options"] & PropsOf<P, RootSlot<P>>, StateIn<P, RootSlot<P>, A>, T>
  : A["options"] & { children?: React.ReactNode }
type RootPropsIn<
  P extends Primitive,
  A,
  T extends Tag | undefined,
> = T extends Tag
  ? Props<
      OptionsIn<P, A> & PropsIn<P, RootSlot<P>, A>,
      StateIn<P, RootSlot<P>, A>,
      T
    >
  : OptionsIn<P, A> & { children?: React.ReactNode }

// A part's component: generic when the primitive's parameters reach its props or state.
type PartOf<P extends Primitive, S extends SlotName<P>, T extends Tag> = [
  GenericOf<P>,
] extends [never]
  ? PartComponent<P, S, T>
  : GenericOf<P> extends { props: Record<S, unknown> }
    ? GenericPartComponent<P, S, T>
    : PartComponent<P, S, T>

// Interfaces, so declaration files name a part's type instead of spelling out
// every prop of its element at each part.
/**
 * A part's component, from `createParts`: the props of slot `S` of primitive
 * `P` rendered as a `T`.
 * @stable
 */
interface PartComponent<
  P extends Primitive,
  S extends SlotName<P>,
  T extends Tag,
> {
  (
    props: Props<
      PropsOf<P, S>,
      [GenericOf<P>] extends [never]
        ? StateOf<P, S>
        : StateIn<P, S, GenericOf<P>>,
      T
    >
  ): React.ReactElement | null
}

/**
 * A part's component whose props take the primitive's type parameter, like an
 * item's `value`, from `createParts`.
 * @stable
 */
interface GenericPartComponent<
  P extends Primitive,
  S extends SlotName<P>,
  T extends Tag,
> {
  <A extends GenericOf<P>["T"] = DefaultOf<GenericOf<P>, "T">>(
    props: Props<
      (Applied<GenericOf<P>, A, unknown>["props"] & Record<S, unknown>)[S],
      StateIn<P, S, Applied<GenericOf<P>, A, unknown>>,
      T
    >
  ): React.ReactElement | null
}

/**
 * The components `createParts` makes: `Root`, and one per tagged slot, named in Pascal case.
 * @stable
 */
type Parts<P extends Primitive, Tags extends { [S in SlotName<P>]?: Tag }> = {
  Root: RootOf<P, Tags extends { root: Tag } ? Tags["root"] : undefined>
} & {
  [
    S in keyof TypesOf<P>["slots"] as S extends Exclude<keyof Tags, "root"> &
      string
      ? Pascal<S>
      : never
  ]: PartOf<P, S & SlotName<P>, NonNullable<Tags[S & keyof Tags]> & Tag>
}

/**
 * Every part of a primitive as a component, typed from it. `Root` makes the
 * instance from the primitive's options and shares it with the parts inside
 * it. Each slot named in `tags` becomes a component that renders that tag,
 * named in Pascal case, like `TabIcon` for `tab-icon`. Without a `root` tag,
 * `Root` renders only its children. Every part takes `render`, and class
 * names, styles and children that may be functions of its state.
 *
 * @example
 * const { Root: Playlist, Track: PlaylistTrack } = createParts(playlist, { root: "ul", track: "li" })
 * @stable
 */
function createParts<
  P extends Primitive,
  Tags extends { [S in SlotName<P>]?: Tag },
>(primitive: P, tags: Tags) {
  const schema = schemaOf(primitive)
  const { context, provides, keyed } = scopeOf(primitive)
  for (const [slot, props] of Object.entries(schema.slots)) {
    for (const key in props) {
      const from = fromOf(props[key], key)
      if (from) {
        provides.add(from.slot)
      }
      if (kindOf(props[key]) === "key") {
        keyed.add(slot)
      }
    }
  }
  const name = pascal(primitive.name ?? "")
  const parts: Record<string, (props: Record<string, any>) => React.ReactNode> =
    {}

  function Root(props: Record<string, any>) {
    const [options, rest] = split(props, schema.options)
    const handle = usePrimitive(
      primitive,
      options as OptionsOf<P>
    ) as unknown as PrimitiveHandle<Primitive>
    // Whether there's a root tag never changes, so the hooks stay in order.
    if (tags.root) {
      return usePart(
        handle,
        "root",
        ...split(rest, schema.slots.root ?? {}),
        tags.root
      )
    }
    return <HandleScope handle={handle}>{props.children}</HandleScope>
  }
  Root.displayName = name
  parts.Root = Root

  for (const [slot, tag] of Object.entries(tags as Record<string, Tag>)) {
    if (slot === "root") {
      continue
    }
    const own = schema.slots[slot] ?? {}
    const ids = Object.keys(own).filter((key) => kindOf(own[key]) === "id")
    const key = Object.keys(own).find((key) => kindOf(own[key]) === "key")
    const Part = (props: Record<string, any>) => {
      const [slotProps, rest] = split(props, own)
      // An `id` the slot reads, like a trigger's key, is the element's own too.
      if (props.id !== undefined) {
        rest.id = props.id
      }
      // Unique ids for `id` props left out. Always made, so the hooks stay in order.
      for (const key of ids) {
        const id = React.useId()
        slotProps[key] ??= id
      }
      const scope = React.useContext(context)
      if (key) {
        slotProps.id ??= (
          scope?.handle.api as ListApi | undefined
        )?.internal.keyOf(slotProps[key])
      }
      for (const prop in own) {
        const spec = own[prop]
        const from = fromOf(spec, prop)
        if (!from || slotProps[prop] !== undefined) {
          continue
        }
        const around = scope?.around[from.slot]
        if (!around && (spec as { required?: boolean }).required) {
          throw new Error(
            `<${Part.displayName}> must be used inside <${name}${pascal(from.slot)}>.`
          )
        }
        slotProps[prop] = around?.[from.prop]
      }
      return usePart(
        primitive,
        slot as SlotName<P>,
        slotProps as never,
        rest,
        tag
      )
    }
    Part.displayName = name + pascal(slot)
    parts[pascal(slot)] = Part
  }
  return parts as unknown as Parts<P, Tags>
}

/** The props of the part of `slot` around the one rendering, like an option's inside its group. */
function useAround<P extends Primitive>(primitive: P, slot: SlotName<P>) {
  return React.useContext(scopeOf(primitive).context)?.around[slot]
}

// Parts of `slot` share their props with the parts inside them, for a slot a
// feature adds, which `createParts` doesn't see in the schema.
function sharesProps(primitive: Primitive, slot: string) {
  scopeOf(primitive).provides.add(slot)
}

export {
  createParts,
  extendHandle,
  HandleScope,
  mergeProps,
  mergeRefs,
  type GenericPartComponent,
  type PartComponent,
  type PartProps,
  type Parts,
  presentIn,
  type PrimitiveHandle,
  readIn,
  reading,
  renderElement,
  type RenderProp,
  sharesProps,
  slotIn,
  useHandle,
  useAround,
  useNearest,
  usePart,
  usePrimitive,
}
