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
  attrs as partAttrs,
  createListSnapshots,
  followed,
  handlers as partHandlers,
  partState,
  present as isPresent,
  ref,
  schemaOf,
  sameSlotState,
  sameValue,
  selectedKeys,
  subscribe,
  takeOwnId,
  touched,
  writes,
  yieldToAuthor,
  type PrimitiveGeneric,
} from "@ui-sdk/core/renderer"
import { dynamic, isServer, type JSX, type ValidComponent } from "@solidjs/web"
import {
  $PROXY,
  children,
  createContext,
  createEffect,
  createMemo,
  createProjection,
  createRoot,
  createSignal,
  createUniqueId,
  getOwner,
  merge,
  omit,
  isHydrating,
  onCleanup,
  onSettled,
  runWithOwner,
  Show,
  untrack,
  useContext,
  type Context,
  type Owner,
} from "solid-js"

// DOM event names to the prop names Solid types. Solid lowercases whatever
// follows `on`, so the casing only matters for finding the user's handler.
const eventProps: Record<string, string> = {
  beforeinput: "onBeforeInput",
  beforematch: "onBeforeMatch",
  blur: "onBlur",
  change: "onChange",
  click: "onClick",
  contextmenu: "onContextMenu",
  copy: "onCopy",
  cut: "onCut",
  dblclick: "onDblClick",
  drop: "onDrop",
  error: "onError",
  focus: "onFocus",
  focusin: "onFocusIn",
  focusout: "onFocusOut",
  input: "onInput",
  invalid: "onInvalid",
  keydown: "onKeyDown",
  keyup: "onKeyUp",
  load: "onLoad",
  mousedown: "onMouseDown",
  paste: "onPaste",
  pointerdown: "onPointerDown",
  pointerenter: "onPointerEnter",
  pointerleave: "onPointerLeave",
  pointermove: "onPointerMove",
  pointerup: "onPointerUp",
  reset: "onReset",
  scroll: "onScroll",
  select: "onSelect",
  submit: "onSubmit",
  toggle: "onToggle",
  wheel: "onWheel",
}

const propOf = (type: string) =>
  eventProps[type] ?? `on${type[0].toUpperCase()}${type.slice(1)}`

// Calls a user's event handler prop the way Solid calls one on an element: a
// function with the event, or the bound form, `[handler, data]`, with its data
// first. `extra` follows the event, and what the handler returns comes back,
// so a Button gets its action's Promise.
function callHandler(handler: unknown, event: Event, ...extra: unknown[]) {
  if (Array.isArray(handler)) {
    return handler[0](handler[1], event, ...extra) as unknown
  }
  if (typeof handler === "function") {
    return handler(event, ...extra) as unknown
  }
}

/**
 * Solid writes `checked` on an input as its live checkedness, again on every
 * spread, which would undo what core writes to a hidden input between
 * renders. Core means the default checkedness, which the server renders and
 * a form reset returns to: `defaultChecked` on the client, like React, and
 * the `checked` attribute on the server, which only knows attributes.
 * Styles become an object, so Solid writes them property by property, as
 * `applyAttrs` does, and an author's own inline styles stay beside them.
 */
function toSolidProps(attrs: Attrs) {
  const props: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) {
      continue
    }
    if (name === "checked") {
      props[isServer ? "checked" : "defaultChecked"] = true
    } else if (name === "style") {
      props.style = styleObject(value)
    } else {
      props[name] = value
    }
  }
  return props
}

// "position:absolute;--x:1" becomes { position: "absolute", "--x": "1" }.
function styleObject(css: string) {
  const style: Record<string, string> = {}
  for (const declaration of css.split(";")) {
    const index = declaration.indexOf(":")
    if (index > 0) {
      style[declaration.slice(0, index).trim()] = declaration
        .slice(index + 1)
        .trim()
    }
  }
  return style
}

// A user's style, maybe a string or a function of the part's state, under the
// part's own. Replacing it, a tree item's `--tree-level` dropped a virtualized
// row's `top`.
function mergeStyles(user: unknown, part: Record<string, string>) {
  const combine = (style: unknown) => ({
    ...(typeof style === "string"
      ? styleObject(style)
      : (style as Record<string, string> | undefined)),
    ...part,
  })
  return typeof user === "function"
    ? (state: unknown) => combine(user(state))
    : combine(user)
}

// One part's subscription to its instance, shared by every scope rendering
// that part. `tick` bumps on every change the part hears, live ones too, for
// a part's state and presence, which may read live state; `attrsTick` only for
// changes that can affect attributes, since core writes live attributes itself.
type Tracked = {
  tick: () => number
  attrsTick: () => number
  users: number
  dispose: () => void
}

type Tracker = (name: string, props: () => unknown) => Tracked

// Each instance's tracker, so a part's state, read from the instance,
// shares a part's subscription with `slot()` and `present()`.
const trackers = new WeakMap<object, Tracker>()
// Each instance's reads of what its props deliver, from `usePrimitive`, and
// its primitive's slots.
const deliveries = new WeakMap<
  object,
  {
    track: (part: Part) => void
    slots: Record<string, Record<string, unknown>> | undefined
  }
>()

// Reads a part from its instance, tracking what it reads of the props'
// delivery. The read itself tracks too, so a callback core calls for the part,
// like a `getHref` that reads a signal, renders it again when that signal
// changes. A read its slot doesn't define, like the attributes of a part
// without `attrs`, reads no state and tracks none of the delivery.
function readPart<T>(
  instance: object,
  part: Part,
  defines: "present" | "attrs" | "state",
  read: () => T
) {
  const delivery = deliveries.get(instance)
  const slot = delivery?.slots?.[part.slot]
  if (!slot || slot[defines]) {
    delivery?.track(part)
  }
  return read()
}

// Records with the same values, so a memo that builds a new but equal one
// keeps its readers from running again.
function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && sameValue(a[key], b[key]))
  )
}

// Subscribes a part once, and keeps it for as long as any scope renders it.
// A scope that re-runs, like a `Show` condition, releases and takes the part
// again. Parts live under a root of their own, made now: a part first tracked
// later, from a children effect, must not take a child index under the
// component, or the elements made after it would hydrate against the wrong
// server keys.
function createTracker(instance: ReturnType<Primitive>) {
  const owner = createRoot(() => getOwner())
  const entries = new Map<Part, Tracked>()
  return (name: string, props: () => unknown) => {
    const part = untrack(() => instance.part(name, props()))
    let entry = entries.get(part)
    if (!entry) {
      entries.set(part, (entry = createTracked(instance, owner, name, props)))
    }
    entry.users++
    const current = entry
    if (getOwner()) {
      onCleanup(() => {
        if (--current.users > 0 || entries.get(part) !== current) {
          return
        }
        current.dispose()
        entries.delete(part)
      })
    }
    return entry
  }
}

function createTracked(
  instance: ReturnType<Primitive>,
  owner: Owner | null,
  name: string,
  props: () => unknown
) {
  // Written from core's listeners, which fire wherever core's lifecycle runs:
  // a part's unbind writes the store, and a cleanup can run inside another
  // computation, like a `For` disposing the component, where Solid refuses an
  // ordinary write and halts.
  const [tick, setTick] = createSignal(0, {
    ownedWrite: true,
    name: `${name} tick`,
  })
  const [attrsTick, setAttrsTick] = createSignal(0, {
    ownedWrite: true,
    name: `${name} attrs tick`,
  })
  // Keys the props deliver reach the part through Solid (`usePrimitive`),
  // not from the effect that hands them to the instance.
  const notify = (liveOnly: boolean, delivered: boolean) => {
    if (delivered) {
      return
    }
    setTick((count) => count + 1)
    if (!liveOnly) {
      setAttrsTick((count) => count + 1)
    }
  }
  const dispose = runWithOwner(owner, () =>
    createRoot((dispose) => {
      let subscribed: Part | undefined
      let selected: string | undefined
      let unsubscribe = () => {}
      // A new key is a new part, and a new value the part selects on needs a
      // new subscription. Props are read in the compute half: a prop's getter
      // may make a memo on its first read, which needs an owner the apply half
      // doesn't have.
      createEffect(
        () => {
          const current = props()
          const part = instance.part(name, current)
          return {
            part,
            props: current,
            selected: selectedKeys(part),
            seen: writes(part.store),
          }
        },
        ({ part, props, selected: values, seen }) => {
          if (part === subscribed && values === selected) {
            return
          }
          subscribed = part
          selected = values
          unsubscribe()
          unsubscribe = subscribe(part, notify, props)
          // The part's readers ran in this flush. A change since, like an
          // effect writing state before this one, reaches them now.
          if (writes(part.store) !== seen) {
            notify(false, false)
          }
        },
        { name: `${name} subscription` }
      )
      onCleanup(() => unsubscribe())
      return dispose
    })
  )!
  return { tick, attrsTick, users: 0, dispose }
}

// A slot's props: core's attributes, listeners and ref over the user's props.
// A key the user passed resolves without touching the attributes, so reading
// `children` or `class` never tracks them, while the attributes themselves
// track, so a spread writes them again when they change. Core's win, like in
// the other adapters, except styles, which combine as they do there, and an
// `id` the user gives, which the parts rendered after it point at, and every
// part once the element binds. A user handler core also listens for was
// wrapped into `own`, so the user's original is skipped. Marked as a proxy, so
// Solid enumerates its keys on every spread instead of tabling them once.
function slotProps(
  user: Record<string, any>,
  skipped: Set<string>,
  own: Record<string, unknown>,
  attrs: () => Record<string, unknown>
) {
  const has = (key: string) =>
    key in own || key in untrack(attrs) || (!skipped.has(key) && key in user)
  const get = (key: string) => {
    if (key in own) {
      return own[key]
    }
    if (key === "id" && user.id != null) {
      return user.id
    }
    if (key === "style" && key in untrack(attrs) && user.style != null) {
      return mergeStyles(user.style, attrs().style as Record<string, string>)
    }
    if (key in untrack(attrs)) {
      return attrs()[key]
    }
    if (skipped.has(key)) {
      return undefined
    }
    return key in user || key === "children" ? user[key] : attrs()[key]
  }
  const proxy: Record<string, any> = new Proxy({} as Record<string, any>, {
    get: (_, key) =>
      typeof key === "string" ? get(key) : key === $PROXY ? proxy : undefined,
    has: (_, key) => (typeof key === "string" ? has(key) : key === $PROXY),
    ownKeys() {
      const keys = new Set<string>(Object.keys(attrs()))
      for (const key of Object.keys(own)) {
        keys.add(key)
      }
      for (const key of Reflect.ownKeys(user)) {
        if (typeof key === "string" && !skipped.has(key)) {
          keys.add(key)
        }
      }
      return [...keys]
    },
    getOwnPropertyDescriptor(_, key) {
      if (typeof key !== "string" || !has(key)) {
        return undefined
      }
      return { enumerable: true, configurable: true, get: () => get(key) }
    },
  })
  return proxy
}

/**
 * What `usePrimitive` returns, and what a component's context holds: one object for the instance's life.
 * @stable
 */
type PrimitiveHandle<P extends Primitive> = {
  /** The primitive it's an instance of. */
  primitive: P
  /** The core instance `usePrimitive` made, with its `get()`, `part()` and `api`. */
  instance: ReturnType<P>
  /** The instance's state now. Reading it doesn't track; parts read theirs from `usePart`. */
  readonly state: TypesOf<P>["state"]
  /** The methods its definition declares, like Tabs' `setValue`. */
  api: TypesOf<P>["api"]
  /** Whether a slot's element should exist. Reading it in a tracking scope, like a `Show` condition, tracks it. */
  present: <S extends SlotName<P>>(
    name: S,
    props?: () => PropsOf<P, S>
  ) => boolean
  /**
   * Props for a slot's element: its attributes, listeners and ref, merged
   * with the user's props, whose handlers run first. Call it in the part's
   * body and spread the result, so the attributes update in place.
   */
  slot: <S extends SlotName<P>>(
    name: S,
    props?: () => PropsOf<P, S>,
    user?: Record<string, any>
  ) => Record<string, any>
}

const noProps = () => ({})

type PartRef = (el: HTMLElement | null) => void

// Two items can trade keys in one flush, like a list reversed in place, so a
// part lets go only of the element this item handed it.
const holders = new WeakMap<PartRef, HTMLElement>()
const hand = (bound: PartRef, el: HTMLElement) => {
  holders.set(bound, el)
  bound(el)
}
const release = (bound: PartRef, el: HTMLElement | null) => {
  if (holders.get(bound) === el) {
    holders.delete(bound)
    bound(null)
  }
}

/**
 * Creates an instance of a primitive for this component, keeps its options
 * current, and destroys it when the component unmounts. Pass the options as a
 * getter, so reactive props stay in sync. Provide the handle to the parts.
 * @stable
 */
function usePrimitive<P extends Primitive>(
  primitive: P,
  options: () => OptionsOf<P>
) {
  // Prefixed so a page using ui-sdk is recognizable from its HTML. Part ids
  // stay unprefixed, since some are keys, like saved resizable layouts.
  const id = `ui-sdk-${createUniqueId()}`
  // Each data list's memo has no owner, so the options memo running again
  // keeps it, and it goes once nothing reads it.
  const snapshot = createListSnapshots(primitive, (compute) =>
    runWithOwner(null, () => createMemo(compute))
  )
  // Made without tracking, the options and what the primitive's first state
  // calls, like an `itemToLabel` that reads a signal: the effect below keeps
  // the options fresh.
  const instance = untrack(() =>
    primitive(snapshot({ ...options(), id }))
  ) as ReturnType<P>
  // Leaving the page settles a pending controller `open()` and detaches the controller.
  onCleanup(() => instance.destroy())
  // The options, made again only when a prop changes to another value.
  const current = createMemo(() => snapshot({ ...options(), id }), {
    equals: sameRecord,
    name: "options",
  })
  // The instance's state reads what the props deliver, like a controlled
  // `open`, from here: a read sees it in the same flush as the app's own
  // signals, before the effect below hands it over.
  const delivered = instance.follow(() => untrack(current))
  // What the props changed in it, by the names parts read it by
  // (`followed`), so a part reruns only for its own: a value moving between
  // two of 500 items reruns two. Both sides read the state held now, so
  // parts hear from the store what state changed since.
  let before: ReturnType<typeof current> | undefined
  const marks = createProjection<Record<string, number>>((draft) => {
    const next = current()
    const previous = before && delivered(undefined, before)
    touched(previous, delivered(), (name) => {
      draft[name] = (draft[name] ?? 0) + 1
    })
    before = next
  }, {})
  deliveries.set(instance, {
    track(part) {
      for (const name of followed(part, untrack(delivered), part.props)) {
        void marks[name]
      }
    },
    slots: primitive.slots as
      Record<string, Record<string, unknown>> | undefined,
  })
  // Keeps callbacks fresh and hands the options to the instance, for its
  // own listeners. Parts already read what they deliver, so they skip it.
  // Untracked, since the instance reads a store's items as it takes a new list.
  createEffect(current, (next) => untrack(() => instance.setOptions(next)), {
    name: "options",
  })
  const track = createTracker(instance)
  trackers.set(instance, track)

  const handle: PrimitiveHandle<P> = {
    primitive,
    instance,
    // Read when used, since reading it wakes an asleep instance.
    get api() {
      return instance.api as TypesOf<P>["api"]
    },
    get state() {
      return instance.get() as TypesOf<P>["state"]
    },
    present(name, props = noProps as never) {
      const tracked = track(name, props)
      // Presence may read live state, so every change counts.
      tracked.tick()
      const part = instance.part(name, props())
      return readPart(instance, part, "present", () =>
        isPresent(part, part.props)
      )
    },
    slot(name, props = noProps as never, user = {}) {
      const tracked = track(name, props)
      // Stable handlers, so the spread never re-attaches them. User handlers
      // run first and can call preventDefault() to skip the built-in behavior.
      const handlers: Record<string, (event: Event) => void> = {}
      for (const type of Object.keys(
        partHandlers(untrack(() => instance.part(name, props())))
      )) {
        const prop = propOf(type)
        // Untracked, since an event can fire inside another component's body,
        // like one that moves focus, and Solid would blame that body's reads.
        handlers[prop] = (event) =>
          untrack(() => {
            callHandler(user[prop], event)
            if (!event.defaultPrevented) {
              ;(
                partHandlers(instance.part(name, props())) as Record<
                  string,
                  (event: Event) => void
                >
              )[type]?.(event)
            }
          })
      }
      // Solid runs refs before the element is in the document, and parts
      // measure when they bind. So a disconnected element binds once the flush
      // that made it has inserted it, with the flush's own effects: a panel's
      // id is on its tab before a screen reader following focus reads the
      // tree. Binding writes what only the element knows, like whether an
      // image loaded, so it runs settled, like an event handler. Solid never
      // calls a ref with null, so the part unbinds when it leaves.
      let element: HTMLElement | null = null
      let attached: HTMLElement | null = null
      let bound = ref(
        untrack(() => instance.part(name, props())),
        { by: "framework", attaches: "all" }
      )
      const attach = (el: HTMLElement) => {
        attached = el
        hand(bound, el)
      }
      // While hydrating, every element is connected already, but its
      // attributes and children render after the ref, so a part that reads
      // or writes them from `bind` would see the server's and Solid would keep
      // them (it skips text writes and never removes server attributes while
      // hydrating): a carousel's play toggle kept "Stop slide rotation" under
      // reduced motion. Those bind from the microtask after `hydrate()`.
      const settled = (el: HTMLElement) => el.isConnected && !isHydrating()
      const bind = (el: HTMLElement) => {
        element = el
        if (settled(el)) {
          return attach(el)
        }
        // Unowned, so it runs once, with the flush's own effects.
        runWithOwner(null, () =>
          onSettled(() => {
            if (element !== el || attached === el) {
              return
            }
            if (settled(el)) {
              return attach(el)
            }
            // Still outside the document, like in a container inserted later, or
            // still hydrating: wait a task.
            queueMicrotask(() => {
              if (element === el && attached !== el) {
                attach(el)
              }
            })
          })
        )
      }
      // A new key is a new part, which takes over the element.
      createEffect(
        () => instance.part(name, props()),
        (part) => {
          const next = ref(part, { by: "framework", attaches: "all" })
          if (next === bound) {
            return
          }
          release(bound, attached)
          bound = next
          if (attached) {
            hand(bound, attached)
          }
        },
        { name: `${name} rebind` }
      )
      onCleanup(() => {
        if (attached) {
          release(bound, attached)
        }
        element = attached = null
      })
      const userRef = untrack(() => user.ref)
      const own = { ...handlers, ref: userRef ? [userRef, bind] : bind }
      // Computed when the element renders, not when the part's body runs: the
      // server computes memos as they're made, and a part behind a context
      // provider renders later than its siblings' bodies run, so a toolbar
      // input claimed the tab stop before the toggles in a group ahead of it.
      const attrs = createMemo(
        () => {
          tracked.attrsTick()
          const part = instance.part(name, props())
          takeOwnId(part, user.id)
          const own = readPart(instance, part, "attrs", () =>
            partAttrs(part, part.props)
          )
          return toSolidProps(yieldToAuthor(own, (name) => user[name] != null))
        },
        { lazy: isServer, equals: sameRecord, name: `${name} attrs` }
      )
      return slotProps(user, new Set(Object.keys(own)), own, attrs)
    },
  }
  return handle
}

// A pending controlled input, like an async `open`, suspends the root here.
// Without a scope of its own, Solid makes the component above it again. The
// label keeps Solid's strict read check on in the body, as in any component.
function rootScope<Root extends (props: never) => JSX.Element>(root: Root) {
  const render = root as unknown as (props: unknown) => JSX.Element
  const label = `<${root.name || "Root"}>`
  const scoped = (props: unknown) =>
    createMemo(() => untrack(() => render(props), label), { name: root.name })
  Object.defineProperty(scoped, "name", { value: root.name })
  return scoped as unknown as Root
}

/**
 * A part's state for `render` functions and state-based class names. Each
 * key is a memo, so a part re-renders for a key only when its value changes:
 * one that never reads `highlighted` never renders for it.
 */
function slotState(
  instance: PrimitiveInstance,
  name: string,
  props: () => unknown
) {
  const track = trackers.get(instance)!
  const tracked = track(name, props)
  // The keys' memos live under a root made now, for the same reason parts do.
  const owner = createRoot(() => getOwner())
  const all = createMemo(
    () => {
      tracked.tick()
      const part = instance.part(name, props() as never)
      return readPart(instance, part, "state", () =>
        partState(part, part.props)
      ) as Record<string, unknown>
    },
    { equals: sameSlotState, name: `${name} state` }
  )
  const keys = new Map<string, () => unknown>()
  return new Proxy({} as Record<string, unknown>, {
    get(_, key) {
      if (typeof key !== "string") {
        return undefined
      }
      let memo = keys.get(key)
      if (!memo) {
        // Owned by the part's root, not by whatever memo reads the key first.
        memo = runWithOwner(owner, () =>
          // A list rebuilt with the same items, like a calendar's weekdays, is the same value.
          createMemo(() => all()[key], {
            equals: sameSlotState,
            name: `${name} state.${key}`,
          })
        )!
        keys.set(key, memo)
      }
      return memo()
    },
  })
}

/**
 * A custom element for a part: its props, which spread onto an element, and its state.
 * @stable
 */
type RenderProp<State = {}> = (
  props: Record<string, any>,
  state: State
) => JSX.Element

/**
 * Props every part takes: its element's props, `render`, and class names,
 * styles and children that may be functions of the part's state.
 * @stable
 */
type PartProps<Tag extends keyof JSX.IntrinsicElements, State = {}> = Omit<
  JSX.IntrinsicElements[Tag],
  "class" | "style" | "children"
> & {
  /** Class names, or a function of the part's state that returns them. */
  class?: JSX.ClassValue | ((state: State) => JSX.ClassValue)
  /** Styles, or a function of the part's state that returns them. */
  style?:
    | JSX.CSSProperties
    | string
    | ((state: State) => JSX.CSSProperties | string | undefined)
  /** Renders your own element: a function of the props to spread and the part's state. */
  render?: RenderProp<State>
  /** Content, or a function of the part's state that returns it. */
  children?: JSX.Element | ((state: State) => JSX.Element)
}

const resolve = (value: unknown, state: unknown) =>
  typeof value === "function" ? value(state) : value

// Children that take the part's state are called with it. A function that
// takes nothing is what a child component compiles to: its accessor, read by
// the element's children effect, which would otherwise track the whole
// subtree here and rebuild it when a nested popup opened. The rule `<Show>`
// reads its children by.
const resolveChildren = (value: unknown, state: unknown) =>
  typeof value === "function" && value.length > 0 ? value(state) : value

// The `render` function with its props and state, or the default tag. Class names, styles and children that are
// functions resolve against the part's state, and run again when the keys
// they read change.
function renderElement(
  tag: string,
  props: Record<string, any>,
  state: unknown
) {
  const resolved = merge(omit(props, "render"), {
    get class() {
      return resolve(props.class, state)
    },
    get style() {
      return resolve(props.style, state)
    },
    get children() {
      return resolveChildren(props.children, state)
    },
  })
  const render = untrack(() => props.render)
  // Lazy on the server for the same reason as a part's attributes: the render
  // function reads them.
  if (typeof render === "function") {
    return createMemo(() => render(resolved, state), {
      lazy: isServer,
    }) as unknown as JSX.Element
  }
  const Tag = dynamic(() => tag)
  return <Tag {...resolved} />
}

// A `render` for a part whose element follows its props, like a link or a
// button: the tag or component `tag` returns.
function renderAs(tag: () => ValidComponent) {
  return (props: Record<string, any>) => {
    const Tag = dynamic(tag)
    return <Tag {...props} />
  }
}

/**
 * Renders a part with no instance behind it, like a trigger outside its
 * component until the component mounts, from a getter of its attributes and
 * state, which follow the props the getter reads.
 */
function renderStatic<State extends object>(
  tag: string,
  view: () => { attrs: Attrs; state: State },
  user: Record<string, any>
) {
  const current = createMemo(view)
  const attrs = createMemo(() => toSolidProps(current().attrs))
  const state = new Proxy({} as State, {
    get: (_, key) => current().state[key as keyof State],
  })
  return renderElement(tag, slotProps(user, new Set(), {}, attrs), state)
}

/**
 * A context provider's element, rendered in document order on the server.
 * Solid's provider computes its children lazily, while everything else on
 * the server renders as it's made, so the parts behind a provider would run
 * after the bodies of the siblings that follow it: a toolbar input claimed
 * the tab stop before the toggles in the group ahead of it. Wrap a provider
 * whose parts claim something, like a roving tab stop.
 */
function provided(element: JSX.Element) {
  if (isServer && typeof element === "function") {
    ;(element as () => unknown)()
  }
  return element
}

// Each primitive's parts share one context: the handle, and getters of the
// props of the parts around the one rendering, by slot, for props a nested
// part takes from its parent, like a handle's item `value`.
type Scope = {
  handle: PrimitiveHandle<Primitive>
  around: Record<string, () => Record<string, unknown>>
}
const scopes = new WeakMap<Primitive, Context<Scope | null>>()
function scopeOf(primitive: Primitive) {
  let context = scopes.get(primitive)
  if (!context) {
    scopes.set(primitive, (context = createContext<Scope | null>(null)))
  }
  return context
}

// A parser function reads an attribute, which only custom elements have.
const kindOf = (spec: PropSpec) =>
  typeof spec === "string"
    ? spec
    : typeof spec === "object"
      ? spec.kind
      : "value"
// Where a prop comes from when it's left out: the slot, and that slot's prop,
// which `"group.id"` names and `"item"` leaves to the prop's own name.
const fromOf = (spec: PropSpec, key: string) => {
  if (typeof spec !== "object") {
    return undefined
  }
  const [slot, prop = key] = spec.from.split(".")
  return { slot, prop }
}

// Each primitive's slots whose props a nested part takes, which provide them to it.
const providers = new WeakMap<Primitive, Set<string>>()
function providersOf(primitive: Primitive) {
  let slots = providers.get(primitive)
  if (!slots) {
    const schema = schemaOf(primitive)
    slots = new Set(
      Object.values(schema.slots).flatMap((props) =>
        Object.entries(props).flatMap(
          ([key, spec]) => fromOf(spec, key)?.slot ?? []
        )
      )
    )
    providers.set(primitive, slots)
  }
  return slots
}

// Each primitive's slots with a `"key"` prop, a list item's value, whose
// nested parts take its key as its value.
const keyedSlots = new WeakMap<Primitive, Set<string>>()
function keyedOf(primitive: Primitive) {
  let slots = keyedSlots.get(primitive)
  if (!slots) {
    const schema = schemaOf(primitive)
    slots = new Set(
      Object.entries(schema.slots).flatMap(([slot, props]) =>
        Object.values(props).some((spec) => kindOf(spec) === "key")
          ? [slot]
          : []
      )
    )
    keyedSlots.set(primitive, slots)
  }
  return slots
}

// A list's api, whose items' values key their parts.
type ListApi = { internal: { keyOf: (value: unknown) => string } }

// "tab-icon" is "TabIcon".
const pascal = (name: string) =>
  name.replace(/(^|-)(\w)/g, (_, _dash, char: string) => char.toUpperCase())

// The props `schema` names, read from a component's props: each read tracks,
// so call it from a getter. What's left out stays out.
function pick(props: Record<string, any>, schema: Record<string, PropSpec>) {
  const named: Record<string, unknown> = {}
  for (const key in schema) {
    const value = props[key]
    if (value !== undefined) {
      named[key] = value
    }
  }
  return named
}

// The element's own props: every prop no schema names, kept reactive.
const elementProps = (
  props: Record<string, any>,
  ...schemas: Record<string, PropSpec>[]
) => omit(props, (key) => schemas.some((schema) => key in schema))

// A part's element with its slot's attributes over `props`, or nothing while
// the slot says it isn't present. A slot that's always present skips the
// check, and the `<Show>` it would take.
function renderSlot(
  owner: PrimitiveHandle<Primitive>,
  slot: string,
  part: () => Record<string, unknown>,
  props: Record<string, any>,
  tag: string
) {
  const state = slotState(owner.instance, slot, part)
  const definition = (
    owner.primitive.slots as Record<string, { present?: unknown }> | undefined
  )?.[slot]
  if (definition && !definition.present) {
    return renderElement(tag, owner.slot(slot, part, props), state)
  }
  return (
    <Show when={owner.present(slot, part)}>
      {renderElement(tag, owner.slot(slot, part, props), state)}
    </Show>
  )
}

/**
 * Renders one part of a primitive written by hand: its element, with the
 * slot's attributes and handlers over `props`, updated in place when what it
 * shows changes, or nothing while the slot says it isn't present. `handle` is
 * `usePrimitive`'s, or the primitive, whose nearest instance it uses. Pass the
 * slot's props as a getter, so reactive props stay in sync. Class names,
 * styles and children that are functions of the part's state run again when
 * the keys they read change. Given `usePrimitive`'s handle, it shares the
 * instance with the parts inside it, like `createParts`'s.
 *
 * @example
 * function StarIcon(props: PartProps<"span", StarIconState> & { value: string }) {
 *   const rest = omit(props, "value")
 *   return usePart(rating, "star-icon", () => ({ value: props.value }), rest, "span")
 * }
 * @stable
 */
function usePart<
  P extends Primitive,
  S extends SlotName<P>,
  State extends StateOf<P, S> = StateOf<P, S>,
  T extends Tag = "div",
>(
  handle: P | PrimitiveHandle<P>,
  slot: S,
  part: () => PropsOf<P, S> = noProps as never,
  props: PartProps<T, State> = {} as PartProps<T, State>,
  tag: T = "div" as T
) {
  const primitive: Primitive =
    typeof handle === "function" ? handle : handle.primitive
  const Scope = scopeOf(primitive)
  const scope = useContext(Scope)
  const owner = (typeof handle === "function" ? scope?.handle : handle) as
    PrimitiveHandle<Primitive> | undefined
  if (!owner) {
    throw new Error(
      `The ${slot} part must be used inside its primitive's root.`
    )
  }
  const slotProps = part as () => Record<string, unknown>
  const provides = providersOf(primitive).has(slot)
  if (owner === scope?.handle && !provides) {
    return renderSlot(owner, slot, slotProps, props, tag)
  }
  // A root written by hand shares its instance with the parts inside it, and
  // a part whose props nested parts take, like an item's value, provides them.
  // Rendered inside the provider, so the parts in it find them, and in
  // document order on the server, so they claim what they claim, like a tab
  // stop, before the parts after it.
  const inherited = owner === scope?.handle ? scope.around : {}
  // The parts inside a keyed item take its key as its value.
  const aroundProps = keyedOf(primitive).has(slot)
    ? () => ({ ...slotProps(), value: slotProps().id })
    : slotProps
  const around = provides ? { ...inherited, [slot]: aroundProps } : inherited
  return provided(
    <Scope value={{ handle: owner, around }}>
      {renderSlot(owner, slot, slotProps, props, tag)}
    </Scope>
  )
}

// The props of the part of `slot` around the one rendering, as a getter, like
// an option's inside its group. An item's `value` is its key.
function useAround<P extends Primitive>(primitive: P, slot: SlotName<P>) {
  return useContext(scopeOf(primitive))?.around[slot]
}

// The nearest instance of a primitive, or undefined outside its root, like a toggle's group.
function useNearest<P extends Primitive>(primitive: P) {
  return useContext(scopeOf(primitive))?.handle as
    PrimitiveHandle<P> | undefined
}

// The nearest instance of a primitive, for a part written by hand that calls its api.
function useHandle<P extends Primitive>(primitive: P) {
  const handle = useNearest(primitive)
  if (!handle) {
    throw new Error(`A ${primitive.name} part must be used inside its root.`)
  }
  return handle
}

// Shares an instance from `usePrimitive` with the parts inside a root written
// by hand that renders no element of its own, like a dialog's. A root with an
// element shares it through `usePart`.
function providePrimitive<P extends Primitive>(
  handle: PrimitiveHandle<P>,
  children: () => JSX.Element
) {
  const Scope = scopeOf(handle.primitive)
  const scope: Scope = {
    handle: handle as unknown as PrimitiveHandle<Primitive>,
    around: {},
  }
  return provided(<Scope value={scope}>{children()}</Scope>)
}

// "tab-icon" is `TabIcon`.
type Pascal<Name extends string> = Name extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${Pascal<Tail>}`
  : Capitalize<Name>

type Tag = keyof JSX.IntrinsicElements

// A part's element props, without the ones its slot or options name.
type ElementProps<T extends Tag, State, Named> = Omit<
  PartProps<T, State>,
  keyof Named
>

// A part's props: what its slot and, for a root, the options name, and its element's.
type Props<Named, State, T extends Tag> = Named & ElementProps<T, State, Named>

type RootSlot<P extends Primitive> = "root" & SlotName<P>

// A slot type core leaves as `any`, like a slot made without type
// parameters, is nothing a part's props or state must name.
type Known<X> = 0 extends 1 & X ? {} : X

// A slot's props as a part takes them. Its `id` is the element's, which the
// slot reads only when its schema names it.
type NamedProps<P extends Primitive, S extends SlotName<P>> = Omit<
  Known<PropsOf<P, S>>,
  "id"
>

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
// A generic's options never include `id`, and an `Omit` there would stop TypeScript inferring its parameters.
// A primitive without parameters (`never`) gets its own types.
type OptionsIn<P extends Primitive, A> = [A] extends [never]
  ? OptionsOf<P>
  : A extends { options: infer O }
    ? O
    : OptionsOf<P>
type StateIn<P extends Primitive, S extends SlotName<P>, A> = [A] extends [
  never,
]
  ? Known<StateOf<P, S>>
  : A extends { state: Record<S, infer State> }
    ? State
    : Known<StateOf<P, S>>
type PropsIn<P extends Primitive, S extends SlotName<P>, A> = [A] extends [
  never,
]
  ? NamedProps<P, S>
  : A extends { props: Record<S, infer Named> }
    ? Named
    : NamedProps<P, S>

// The root's component: generic over the primitive's parameters when it has them.
type RootOf<P extends Primitive, T extends Tag | undefined> = [
  GenericOf<P>,
] extends [never]
  ? (props: RootPropsIn<P, never, T>) => JSX.Element
  : <
      A extends GenericOf<P>["T"] = DefaultOf<GenericOf<P>, "T">,
      B extends GenericOf<P>["U"] = DefaultOf<GenericOf<P>, "U">,
    >(
      props: GenericRootProps<P, Applied<GenericOf<P>, A, B>, T>
    ) => JSX.Element
// Indexed, not matched with a conditional, so TypeScript infers the parameters from the props.
type GenericRootProps<
  P extends Primitive,
  A extends PrimitiveGeneric,
  T extends Tag | undefined,
> = T extends Tag
  ? Props<
      A["options"] & NamedProps<P, RootSlot<P>>,
      StateIn<P, RootSlot<P>, A>,
      T
    >
  : A["options"] & { children?: JSX.Element }
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
  : OptionsIn<P, A> & { children?: JSX.Element }

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
      NamedProps<P, S>,
      [GenericOf<P>] extends [never]
        ? Known<StateOf<P, S>>
        : StateIn<P, S, GenericOf<P>>,
      T
    >
  ): JSX.Element
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
  ): JSX.Element
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
 * `Root` renders only its children. Every part takes `render`, and
 * class names, styles and children that may be functions of its state.
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
  const Scope = scopeOf(primitive)
  const name = pascal(primitive.name)
  const parts: Record<string, (props: Record<string, any>) => JSX.Element> = {}

  const rootTag = (tags as Record<string, Tag>).root
  const rootProps = schema.slots.root ?? {}
  parts.Root = rootScope((props) => {
    const handle = usePrimitive(
      primitive,
      () => pick(props, schema.options) as OptionsOf<P>
    )
    if (rootTag) {
      const rest = elementProps(props, schema.options, rootProps)
      return usePart(
        handle,
        "root" as never,
        () => pick(props, rootProps) as never,
        rest,
        rootTag
      )
    }
    return providePrimitive(handle, () => props.children)
  })

  for (const [slot, tag] of Object.entries(tags as Record<string, Tag>)) {
    if (slot === "root") {
      continue
    }
    const propsSchema = schema.slots[slot] ?? {}
    const ids = Object.keys(propsSchema).filter(
      (key) => kindOf(propsSchema[key]) === "id"
    )
    const key = Object.keys(propsSchema).find(
      (key) => kindOf(propsSchema[key]) === "key"
    )
    const required = Object.entries(propsSchema).flatMap(([key, spec]) =>
      typeof spec === "object" && spec.required
        ? (fromOf(spec, key)?.slot ?? [])
        : []
    )
    parts[pascal(slot)] = (props) => {
      const scope = useContext(Scope)
      if (!scope) {
        throw new Error(
          `<${name}${pascal(slot)}> must be used inside <${name}>.`
        )
      }
      for (const parent of required) {
        if (!scope.around[parent]) {
          throw new Error(
            `<${name}${pascal(slot)}> must be used inside <${name}${pascal(parent)}>.`
          )
        }
      }
      // Unique ids for `id` props left out, made once.
      const made: Record<string, string> = {}
      for (const key of ids) {
        made[key] = createUniqueId()
      }
      const part = () => {
        const named = pick(props, propsSchema)
        for (const key in propsSchema) {
          if (named[key] !== undefined) {
            continue
          }
          const from = fromOf(propsSchema[key], key)
          const value =
            made[key] ??
            (from ? scope.around[from.slot]?.()[from.prop] : undefined)
          if (value !== undefined) {
            named[key] = value
          }
        }
        // A list item is keyed by its value's key, which may be an object.
        if (key) {
          named.id = (scope.handle.api as ListApi).internal.keyOf(named[key])
        }
        return named
      }
      // An `id` the slot reads, like a toolbar item's key, is the element's own too.
      const element = omit(props, (key) => key !== "id" && key in propsSchema)
      return usePart(scope.handle, slot as never, part as never, element, tag)
    }
  }
  return parts as unknown as Parts<P, Tags>
}

// Whether a part among the children said it's there, like a data select's
// own content. Plain, so the render that wrote it reads it, on the server too,
// where writing a signal is deprecated. The signal carries later changes.
function createChildFlag() {
  let present = false
  const [version, setVersion] = createSignal(0, { ownedWrite: true })
  return [
    () => {
      if (!isServer) {
        version()
      }
      return present
    },
    (next: boolean) => {
      present = next
      if (!isServer) {
        setVersion((count) => count + 1)
      }
    },
  ] as const
}

// The children of a root that renders a part itself unless one is among them,
// and whether one is. They resolve before the answer, since a `Show` after
// them reads its condition as it's made, before the server renders them.
function ownChildren(
  render: (register: (present: boolean) => void) => JSX.Element
) {
  const [present, register] = createChildFlag()
  const resolved = children(() => render(register))
  return [resolved, () => (resolved(), present())] as const
}

export {
  callHandler,
  createChildFlag,
  createParts,
  type GenericPartComponent,
  ownChildren,
  type PartComponent,
  type PartProps,
  type Parts,
  type PrimitiveHandle,
  provided,
  providePrimitive,
  type RenderProp,
  renderAs,
  renderStatic,
  rootScope,
  toSolidProps,
  useAround,
  useHandle,
  useNearest,
  usePart,
  usePrimitive,
}
