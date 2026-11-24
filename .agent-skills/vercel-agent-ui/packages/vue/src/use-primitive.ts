import type {
  Attrs,
  OptionsOf,
  Part,
  Primitive,
  PrimitiveInstance,
  PropsOf,
  SlotName,
  StateOf,
  TypesOf,
} from "@ui-sdk/core"
import {
  attrs as partAttrs,
  createListSnapshots,
  directNames,
  handlers as partHandlers,
  keep,
  noteEarlyText,
  partState,
  present as isPresent,
  ref,
  renderVersion,
  sameSlotState,
  selectedKeys,
  subscribe,
  takeOwnId,
  unwatched,
  yieldToAuthor,
} from "@ui-sdk/core/renderer"
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  hasInjectionContext,
  inject,
  normalizeClass,
  normalizeStyle,
  onMounted,
  onScopeDispose,
  onUnmounted,
  provide,
  shallowRef,
  toRaw,
  useAttrs,
  useId,
  useSlots,
  watchEffect,
  type ComponentInternalInstance,
  type FunctionalComponent,
  type InjectionKey,
  type PropType,
  type ShallowRef,
  type Slots,
  type SlotsType,
  type VNode,
} from "vue"
import { slotContent } from "./children"
import { useBindings } from "./lifecycle"

// Booleans default to undefined so "not passed" stays different from false.
const optionalBoolean = { type: Boolean, default: undefined }

// In a Vapor component's setup, `getCurrentInstance()` is null though `inject`
// works. Without vaporInteropPlugin, a Vapor app sets up ui-sdk's parts that way.
function refuseVapor(subject: string) {
  if (!getCurrentInstance() && hasInjectionContext()) {
    throw new Error(
      `${subject} isn't set up in a VDOM component's setup. In a Vapor app, install vaporInteropPlugin, and define your own parts with defineComponent.`
    )
  }
}

// A component's main value, from its own prop or from `v-model`. `null` is a
// value, like a navigation menu with nothing open, so only `undefined` falls back.
const orModel = <T>(value: T | undefined, model: T | undefined) =>
  value === undefined ? model : value

type RefFunction = (el: unknown) => void
const combined = new WeakMap<RefFunction, WeakMap<RefFunction, RefFunction>>()

// One ref that calls two, the same function for the same pair, so Vue never
// detaches and reattaches the element. Vue's mergeProps keeps only the last ref.
function bothRefs(a: RefFunction | undefined, b: RefFunction | undefined) {
  if (!a || !b) {
    return a ?? b
  }
  let inner = combined.get(a)
  if (!inner) {
    combined.set(a, (inner = new WeakMap()))
  }
  let ref = inner.get(b)
  if (!ref) {
    ref = (el) => {
      a(el)
      b(el)
    }
    inner.set(b, ref)
  }
  return ref
}

// "position:absolute;margin:-1px" becomes { position: "absolute", margin: "-1px" }.
// Vue parses a string style again whenever it merges props, so each text is
// parsed once here. Vue only reads the objects. The cache empties when it
// fills, since a drag writes a new position on every move.
const styles = new Map<string, Record<string, string>>()

function styleObject(css: string) {
  let style = styles.get(css)
  if (style) {
    return style
  }
  style = {}
  for (const declaration of css.split(";")) {
    const index = declaration.indexOf(":")
    if (index !== -1) {
      style[declaration.slice(0, index).trim()] = declaration
        .slice(index + 1)
        .trim()
    }
  }
  if (styles.size >= 500) {
    styles.clear()
  }
  styles.set(css, style)
  return style
}

// "keydown" becomes "onKeydown", the prop Vue binds a listener from.
const listenerProps = new Map<string, string>()
function listenerProp(type: string) {
  let prop = listenerProps.get(type)
  if (!prop) {
    listenerProps.set(
      type,
      (prop = `on${type[0].toUpperCase()}${type.slice(1)}`)
    )
  }
  return prop
}

// A part's attributes merged into the user's in one pass, as `mergeProps(user, part)` would,
// but for an `id` and what `yieldToAuthor` leaves to the user. Undefined attributes are
// absent, so they never replace a value merged in, like a field's on its control.
function mergeAttrs(result: Record<string, any>, attrs: Attrs) {
  const own = yieldToAuthor(attrs, (name) => result[name] != null)
  for (const key in own) {
    const value = own[key]
    if (value === undefined || (key === "id" && result.id != null)) {
      continue
    }
    if (key === "style") {
      result.style = result.style
        ? normalizeStyle([result.style, styleObject(value)])
        : styleObject(value)
    } else {
      result[key] =
        key === "class" && result.class
          ? normalizeClass([result.class, value])
          : value
    }
  }
  return result
}

/**
 * What `usePrimitive` returns, and what the parts inside its component find.
 * @stable
 */
type PrimitiveHandle<P extends Primitive> = {
  /** The primitive it's an instance of. */
  primitive: P
  /** The core instance `usePrimitive` made, with its `get()`, `part()` and `api`. Read `state` instead of its `get()` in a render, since `get()` tracks nothing. */
  instance: ReturnType<P>
  /** The methods its definition declares, like Tabs' `setValue`. */
  api: TypesOf<P>["api"]
  /** The instance's state. Reading it inside a render tracks it. */
  readonly state: TypesOf<P>["state"]
  /** Whether a slot's element should exist. Reading it inside a render tracks it. */
  present: <S extends SlotName<P>>(name: S, props?: PropsOf<P, S>) => boolean
  /** Attributes, listeners and a ref for a slot's element. User listeners run first. */
  slot: <S extends SlotName<P>>(
    name: S,
    props?: PropsOf<P, S>,
    user?: Record<string, any>
  ) => Record<string, any>
}

// Each primitive's parts share one scope: the nearest instance, and getters
// for the props of the parts around the one rendering, by slot, for props a
// nested part takes from its parent, like an icon's item `value`.
type Scope = {
  handle: PrimitiveHandle<Primitive>
  around: Record<string, () => Record<string, unknown>>
}
const scopes = new WeakMap<Primitive, InjectionKey<Scope>>()
function scopeKey(primitive: Primitive) {
  let key = scopes.get(primitive)
  if (!key) {
    scopes.set(primitive, (key = Symbol(primitive.name)))
  }
  return key
}

// "tab-icon" is "TabIcon".
const pascal = (name: string) =>
  name.replace(/(^|-)(\w)/g, (_, _dash, char: string) => char.toUpperCase())

/** The nearest instance of a primitive and the props of the parts around, or null outside one. */
function useScope<P extends Primitive>(primitive: P) {
  return inject(scopeKey(primitive), null) as
    (Scope & { handle: PrimitiveHandle<P> }) | null
}

/** The nearest instance of a primitive, for a part written by hand. Throws outside one. */
function useHandle<P extends Primitive>(primitive: P) {
  const scope = useScope(primitive)
  if (!scope) {
    const name = pascal(primitive.name)
    throw new Error(`${name} parts must be used inside <${name}>.`)
  }
  return scope.handle
}

/** Shares a handle with the parts inside, like a trigger's outside its root, connected by a controller. */
function provideHandle<P extends Primitive>(handle: PrimitiveHandle<P>) {
  provide(scopeKey(handle.primitive), {
    handle: handle as PrimitiveHandle<Primitive>,
    around: {},
  })
}

/**
 * Shares a part's props with the parts inside it, for the props they take
 * from it when they're left out, like an item's `value` for its icon.
 */
function provideProps(
  primitive: Primitive,
  slot: string,
  props: () => Record<string, unknown>
) {
  const scope = useScope(primitive)
  if (scope) {
    provide(scopeKey(primitive), {
      ...scope,
      around: { ...scope.around, [slot]: props },
    })
  }
}

const memo = <Value>(compute: () => Value) => {
  const value = computed(compute)
  return () => value.value
}

/**
 * Creates an instance of a primitive for this component, keeps its options
 * current, and destroys it when the component unmounts. Pass the options as a
 * getter, so reactive props stay in sync. Parts inside the component use it.
 * @stable
 */
function usePrimitive<P extends Primitive>(
  primitive: P,
  options: () => OptionsOf<P>
) {
  refuseVapor("A ui-sdk root")
  // Prefixed so a page using ui-sdk is recognizable from its HTML. Part ids
  // stay unprefixed, since some are keys, like saved resizable layouts.
  const id = `ui-sdk-${useId()}`
  const snapshot = createListSnapshots(primitive, memo)
  // What reaches outside the instance, like its controller, starts once it
  // mounts, since a server never mounts or unmounts it: a module-level
  // controller would stay attached to one request's instance.
  noteEarlyText()
  const instance = unwatched(() =>
    primitive(snapshot({ ...options(), id }))
  ) as ReturnType<P>
  onMounted(() => keep(instance))
  const version = shallowRef(renderVersion(instance))
  onScopeDispose(
    instance.subscribe(() => (version.value = renderVersion(instance)))
  )
  // Leaving the page settles a pending controller `open()` and detaches the controller.
  onScopeDispose(() => instance.destroy())
  watchEffect(() => instance.setOptions(snapshot({ ...options(), id })))
  const partRef = useBindings()
  const watchPart = createPartWatcher(instance)
  watchers.set(instance, watchPart)
  // Outside a component's render, like in a watcher, every change counts.
  const track = (part: Part) => {
    const owner = getCurrentInstance()
    if (owner) {
      return watchPart(owner, part)
    }
    version.value
  }

  const value: PrimitiveHandle<P> = {
    primitive,
    instance,
    // Read when used, since reading it wakes an asleep instance.
    get api() {
      return instance.api as TypesOf<P>["api"]
    },
    // Reading it inside a render tracks every change that affects rendering.
    get state() {
      version.value
      return instance.get() as TypesOf<P>["state"]
    },
    // Reading it inside a render tracks this part's presence.
    present<S extends SlotName<P>>(name: S, props?: PropsOf<P, S>) {
      const part = instance.part(name, props)
      const present = isPresent(part)
      const watched = track(part)
      if (watched) {
        watched.present = present
      }
      return present
    },
    // Attributes, listeners and a ref for a slot's element. Vue binds HTML
    // attributes as-is. User listeners run first and can preventDefault().
    // Reading it inside a render tracks the part's attributes.
    slot<S extends SlotName<P>>(
      name: S,
      props?: PropsOf<P, S>,
      user: Record<string, any> = {}
    ) {
      const part = instance.part(name, props)
      takeOwnId(part, user.id)
      const attrs = partAttrs(part)
      const watched = track(part)
      if (watched) {
        watched.attrs = attrs
      }
      const result: Record<string, any> = {}
      for (const key in user) {
        if (key !== "ref") {
          result[key] = user[key]
        }
      }
      mergeAttrs(result, attrs)
      const handlers = partHandlers(part)
      for (const type in handlers) {
        const prop = listenerProp(type)
        const handler = handlers[type as keyof typeof handlers]!
        const userHandler = result[prop]
        // Core's listeners skip events already canceled, so user listeners
        // run first and can cancel.
        result[prop] = userHandler
          ? (event: Event) => {
              for (const fn of [userHandler].flat()) {
                fn?.(event)
              }
              handler(event)
            }
          : handler
      }
      result.ref = bothRefs(
        user.ref,
        partRef(ref(part, { by: "framework", attaches: "all" }), name)
      )
      return result
    },
  }

  provideHandle(value)
  return value
}

// What one part rendered through `slot()` and `present()`, what its state
// listens for, and the one subscription both share.
type PartWatch = {
  tick: ShallowRef<number>
  // The props it last rendered with, which the listener compares against.
  props: unknown
  attrs?: Attrs
  present?: boolean
  version: number
  subscription?: string
  unsubscribe?: () => void
  // The listener of the part's state, which re-renders it for state it read.
  onChange?: () => void
}

// Each instance's part watcher, so a part's state, which only has the
// instance, shares the part's subscription with `slot()`.
const watchers = new WeakMap<object, ReturnType<typeof createPartWatcher>>()

/**
 * Re-renders a part only when its attributes or presence change, the way
 * React's parts do, instead of on every change that affects rendering:
 * toggling one checkbox item re-renders that item, not all. The part is the
 * component rendering when it calls `slot()` or `present()`, and its
 * subscription lasts until that component unmounts.
 */
function createPartWatcher(instance: ReturnType<Primitive>) {
  const owners = new WeakMap<ComponentInternalInstance, Map<Part, PartWatch>>()

  // Live state renders only through state a part read, so a change to live
  // keys alone, like the highlight, has no attributes to compare. Core writes
  // a slot's `direct` attributes to the element itself, so they don't count.
  function check(part: Part, watch: PartWatch, liveOnly: boolean) {
    watch.onChange?.()
    const moved = () =>
      watch.present !== undefined &&
      isPresent(part, watch.props) !== watch.present
    // Presence may read live state, so a live change checks it alone.
    if (liveOnly) {
      if (moved()) {
        watch.tick.value++
      }
      return
    }
    const version = renderVersion(instance)
    if (version === watch.version) {
      return
    }
    watch.version = version
    if (
      moved() ||
      (watch.attrs &&
        !sameAttrs(
          partAttrs(part, watch.props),
          watch.attrs,
          directNames(part)
        ))
    ) {
      watch.tick.value++
    }
  }

  // What `owner` renders for this part, subscribed and tracked by whatever
  // reactive effect runs now, usually the owner's render.
  return (owner: ComponentInternalInstance, part: Part) => {
    let watched = owners.get(owner)
    if (!watched) {
      const own = (watched = new Map())
      owners.set(owner, own)
      onUnmounted(() => own.forEach((watch) => watch.unsubscribe?.()), owner)
    }
    let watch = watched.get(part)
    if (!watch) {
      watched.set(
        part,
        (watch = { tick: shallowRef(0), props: part.props, version: 0 })
      )
    }
    watch.props = part.props
    watch.version = renderVersion(instance)
    // A new value the part selects on needs a new subscription.
    const subscription = selectedKeys(part)
    if (watch.subscription !== subscription) {
      const current = watch
      current.unsubscribe?.()
      current.subscription = subscription
      current.unsubscribe = subscribe(part, (liveOnly) =>
        check(part, current, liveOnly)
      )
    }
    watch.tick.value
    return watch
  }
}

// Attributes in `skip` may differ.
function sameAttrs(a: Attrs, b: Attrs, skip: readonly string[] = []) {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key] || skip.includes(key))
  )
}

/**
 * A plain copy of a component's props that tracks each one it reads, for
 * spreading into options. Vue's props are a proxy, and V8 copies a proxy
 * with spread or rest through a slow generic path: in Node, a tooltip's 12
 * props took 9 µs that way and 0.8 µs read one by one. The raw props hold every
 * declared prop, so the copy has the same keys in the same order.
 */
function copyProps<T extends object>(props: T) {
  const copy = {} as T
  for (const key in toRaw(props)) {
    copy[key as keyof T] = props[key as keyof T]
  }
  return copy
}

/**
 * A part's state for its slots. Reading it subscribes the part to the keys
 * read, so parts that never read live state, like the highlighted item or
 * whether a scroll area is scrolling, never re-render for it.
 */
function trackedState(
  instance: PrimitiveInstance,
  name: string,
  props: () => object
) {
  const tick = shallowRef(0)
  let last: Record<string, unknown> | undefined
  let unsubscribe: (() => void) | undefined
  // The keys read since the part last changed. Only those re-render it, so a
  // part that never reads a resizable panel's size, or whether a scroll area
  // is scrolling, never renders for it. They're cleared only when the part
  // changes, which renders everything that read them, so a component the
  // state was passed to reads its keys again too.
  const read = new Set<string>()
  const current = () =>
    partState(instance.part(name, props())) as Record<string, unknown>
  // A loop rather than an array, since this runs on every change that reaches the part.
  const changed = (next: Record<string, unknown>) => {
    for (const key of read) {
      if (!sameSlotState(next[key], last![key])) {
        return true
      }
    }
    return false
  }
  const listener = () => {
    const next = current()
    if (!changed(next)) {
      return
    }
    last = next
    // The render this causes reads its keys again.
    read.clear()
    tick.value++
  }
  // Subscribed on the first read, and again on a read whose props name
  // another part or new values to select on. Every read calls `props()`, so
  // whatever read the state, even another component, renders again when
  // they change and reads again (`test/slot-state.test.ts`). A watcher per
  // part, which costs a long list's opening more than its subscriptions do,
  // isn't needed. The part shares the subscription `slot()` makes for it, so
  // each part keeps one.
  const component = getCurrentInstance()
  const shared = component && watchers.get(instance)
  let watch: PartWatch | undefined
  let subscribed: Part | undefined
  let selected: string | undefined
  const watchPart = (part: Part) => {
    const values = selectedKeys(part)
    if (part === subscribed && values === selected) {
      return
    }
    subscribed = part
    selected = values
    if (shared) {
      // A new key is another part, and the old one stops reporting here.
      if (watch) {
        watch.onChange = undefined
      }
      watch = shared(component, part)
      watch.onChange = listener
      return
    }
    unsubscribe?.()
    unsubscribe = subscribe(part, listener)
  }
  onScopeDispose(() => unsubscribe?.())
  return new Proxy({} as Record<string, unknown>, {
    get(_, key) {
      tick.value
      const part = instance.part(name, props())
      last = partState(part) as Record<string, unknown>
      if (typeof key === "string") {
        read.add(key)
      }
      watchPart(part)
      return last[key as string]
    },
  })
}

// A part's slots: its content and the `render` slot receive its state.
type StateSlotFunctions<State> = {
  /** The part's content, which receives its state. */
  default?: (scope: { state: State }) => VNode[]
  /**
   * Renders your own element: bind `props` to it. `children` is the part's
   * content, like a slider thumb's range input: render it inside with
   * `<component :is="children" />`.
   */
  render?: (scope: {
    props: Record<string, unknown>
    state: State
    children: FunctionalComponent
  }) => VNode[]
}
type StateSlots<State> = SlotsType<StateSlotFunctions<State>>

/**
 * A part's slots, typed from its primitive, for a part written by hand:
 * `slots: Object as PartSlots<typeof rating, "star">`, so a template reads
 * its state with the types and completion of a `createParts` part.
 * @stable
 */
type PartSlots<P extends Primitive, S extends SlotName<P>> = StateSlots<
  StateOf<P, S>
>

// Renders a default slot in a component of its own, which renders again only
// when the slot does: for a slot made anew, like one that reads a `v-for`
// variable, or for reactive state it reads. A slot called in its part's own
// render runs again whenever the part renders, and Vue then renders every
// component in it, like every item of a long list each time its popup opens.
const SlotHost = defineComponent({
  name: "SlotHost",
  props: {
    slot: {
      type: Function as PropType<(props: { state: object }) => VNode[]>,
      required: true,
    },
    state: { type: Object, required: true },
    fallback: Function as PropType<() => unknown>,
  },
  setup: (props) => () =>
    slotContent(props.slot, { state: props.state }) ?? props.fallback?.(),
})

// The fallback SlotHost gets, one function per part, so a new one from each
// render of the part doesn't render the slot again. It reads the latest
// fallback from a ref, so a slot that shows it renders again when it changes.
const fallbacks = new WeakMap<
  Slots,
  { latest: ShallowRef<() => unknown>; fallback: () => unknown }
>()

function fallbackOf(slots: Slots, fallback: () => unknown) {
  let entry = fallbacks.get(slots)
  if (!entry) {
    const latest = shallowRef(fallback)
    fallbacks.set(slots, (entry = { latest, fallback: () => latest.value() }))
  }
  entry.latest.value = fallback
  return entry.fallback
}

/** A part's default slot, rendered apart from the part, or `fallback` when it renders nothing. */
function defaultSlot(slots: Slots, state: object, fallback?: () => unknown) {
  if (!slots.default) {
    return fallback?.()
  }
  return h(SlotHost, {
    slot: slots.default,
    state,
    fallback: fallback && fallbackOf(slots, fallback),
  })
}

/**
 * How `usePart` renders a part beyond its tag: content of its own in place of
 * the default slot, an element it always holds, and props added after the
 * slot's attributes.
 * @stable
 */
type PartElement<State> = {
  /** The tag it renders unless the `render` slot replaces it. */
  tag: string
  /** Its content, from its state. Without it, the default slot, which receives the state. */
  children?: (state: State) => unknown
  /** An element inside the part, or next to what the `render` slot returns, like a root's hidden form input. */
  hidden?: () => VNode
  /** Its props after the slot's attributes merge in, like a field's attributes on its control. */
  extend?: (props: Record<string, any>) => Record<string, any>
}

// The component the `render` slot gets as `children`, one per part, so the
// content it renders, like a focused input, stays when the part renders
// again. It takes no props, so Vue skips it when the part renders; the part
// hands it its latest content through a ref it reads, which renders it again.
const contents = new WeakMap<
  Slots,
  { own: ShallowRef<() => unknown>; component: FunctionalComponent }
>()

function contentOf(slots: Slots, own: () => unknown) {
  let content = contents.get(slots)
  if (!content) {
    const latest = shallowRef(own)
    contents.set(
      slots,
      (content = { own: latest, component: () => latest.value() })
    )
  }
  content.own.value = own
  return content.component
}

// Renders a part's element: the `render` slot with its props, state and
// content, like a slider thumb's range input, or the tag. `hidden` renders
// inside the element, or next to what the `render` slot returns, since it
// must exist either way.
function renderElement(
  props: Record<string, unknown>,
  slots: Slots,
  state: object | undefined,
  element: PartElement<any>
) {
  const { tag, children, hidden } = element
  const own = children
    ? () => children(state)
    : () => slots.default?.({ state })
  if (slots.render) {
    const rendered = slots.render({
      props,
      state,
      children: contentOf(slots, own),
    })
    if (hidden) {
      return [...rendered, hidden()]
    }
    // One element, not a fragment, so a ref to the part's component gets it as `$el`.
    return rendered.length === 1 ? rendered[0] : rendered
  }
  const content = hidden ? () => [own(), hidden()] : own
  return h(tag, props, content() as never)
}

/**
 * Renders one part of a primitive written by hand, from its component's
 * setup: its element, with the slot's attributes and handlers merged into the
 * component's attrs, re-rendered when what it shows changes, or nothing while
 * the slot says it isn't present. Returns the render function, with the
 * part's state as its `state`. `handle` is `usePrimitive`'s, or the
 * primitive, whose nearest instance it uses. `props` replaces the element
 * props, the component's attrs by default. The `render` slot and the default
 * slot receive the part's state. `element` is the tag, or what to render
 * beyond it (`PartElement`).
 *
 * @example
 * const StarIcon = defineComponent({
 *   inheritAttrs: false,
 *   props: { value: { type: String, required: true } },
 *   setup: (props) => usePart(rating, "star-icon", () => ({ value: props.value }), undefined, "span"),
 * })
 * @stable
 */
function usePart<P extends Primitive, S extends SlotName<P>>(
  handle: P | PrimitiveHandle<P>,
  slot: S,
  slotProps = () => ({}) as PropsOf<P, S>,
  props?: () => Record<string, unknown>,
  element: string | PartElement<StateOf<P, S>> = "div"
) {
  refuseVapor(`The ${slot} part`)
  const component = getCurrentInstance()
  if (!component) {
    throw new Error(`The ${slot} part must call usePart in its setup.`)
  }
  const owner = typeof handle === "function" ? useScope(handle)?.handle : handle
  if (!owner) {
    throw new Error(
      `The ${slot} part must be used inside its primitive's root.`
    )
  }
  const attrs = useAttrs()
  const slots = useSlots()
  const user = props ?? (() => attrs)
  const options = typeof element === "string" ? { tag: element } : element
  const state = trackedState(owner.instance, slot, slotProps) as StateOf<P, S>
  const render = () => {
    const current = slotProps()
    // A part that shouldn't be in the page, like an unselected tab's panel, renders nothing.
    if (!owner.present(slot, current)) {
      return null
    }
    const merged = owner.slot(slot, current, user())
    return renderElement(
      options.extend ? options.extend(merged) : merged,
      slots,
      state,
      options
    )
  }
  return Object.assign(render, { state })
}

export {
  copyProps,
  defaultSlot,
  optionalBoolean,
  orModel,
  pascal,
  type PartElement,
  type PartSlots,
  type PrimitiveHandle,
  provideHandle,
  provideProps,
  renderElement,
  type StateSlotFunctions,
  type StateSlots,
  useHandle,
  usePart,
  usePrimitive,
  useScope,
}
