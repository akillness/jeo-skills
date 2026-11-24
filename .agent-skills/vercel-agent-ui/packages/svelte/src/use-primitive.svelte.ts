import type {
  Attrs,
  OptionsOf,
  Part as CorePart,
  Primitive,
  PropsOf,
  SlotName,
  StateOf,
  TypesOf,
} from "@ui-sdk/core"
import {
  applyAttrs,
  attrs as partAttrs,
  createListSnapshots,
  directNames,
  followed,
  handlers as partHandlers,
  noteEarlyText,
  on,
  partState,
  present as isPresent,
  ref as partRef,
  renderVersion,
  sameSlotState,
  schemaOf,
  selectedKeys,
  subscribe,
  takeOwnId,
  touched,
  yieldToAuthor,
} from "@ui-sdk/core/renderer"
import { onDestroy, untrack, type Snippet } from "svelte"
import { createAttachmentKey, type Attachment } from "svelte/attachments"
import type { SvelteHTMLElements } from "svelte/elements"
import { trackBindable } from "./bindable.svelte"

/**
 * What `usePrimitive` returns, and what a component puts in context for its parts.
 * @stable
 */
type PrimitiveHandle<P extends Primitive> = {
  /** The core instance `usePrimitive` made, with its `get()`, `part()` and `api`. */
  instance: ReturnType<P>
  /** The methods its definition declares, like Tabs' `setValue`. */
  api: TypesOf<P>["api"]
  /** The instance's state now. Reading it tracks nothing; parts read theirs through `usePart`. */
  readonly state: TypesOf<P>["state"]
  /**
   * Whether the parent controls a key with a default, like `value`: it was
   * defined from the start, the parent set it since, or the parent refused a
   * change to it. Reading it tracks it.
   */
  controls: (key: string) => boolean
}

// Each instance's reads of what its props deliver, from `usePrimitive`: the
// names a part reads them by (`followed`), as one string that changes only
// when one of them does.
const deliveries = new WeakMap<object, (part: CorePart) => string>()

// Per instance with `onOpenChangeComplete`: its popup elements that stopped
// being present since the last call, each settling once Svelte removed it.
// Svelte starts a `transition:` or `out:` outro only once the core has
// finished closing, so a close completes when those outros end.
const exits = new WeakMap<object, Promise<void>[]>()
// Svelte runs an element's cleanup in the teardown of the effect removing it,
// where reading `current` runs it again and it stops following the props.
// Reads from such a cleanup get the options delivered last.
let tearingDown = 0

const memo = <Value>(compute: () => Value) => {
  const value = $derived.by(compute)
  return () => value
}

/**
 * Creates the instance for a component's life. `options` is a getter, so
 * the props it reads stay in sync, and carries the component's `$props.id()`
 * as `id`, prefixed so a page using ui-sdk is recognizable
 * from its HTML. Part ids stay unprefixed, since some are keys, like saved
 * resizable layouts. Only a component's script can call `$props.id()`, and
 * only it matches between the server and the client, so the id is passed in.
 * @stable
 */
function usePrimitive<P extends Primitive>(
  primitive: P,
  options: () => OptionsOf<P> & { id: string }
) {
  const snapshot = createListSnapshots(primitive, memo)
  // The first options go into the constructor, since effects never run on the server.
  const first = untrack(() => snapshot(options()))
  const prefixed = `ui-sdk-${first.id}`
  noteEarlyText()
  const instance = primitive({ ...first, id: prefixed }) as ReturnType<P>
  const bindable = trackBindable(primitive, instance.get(), first, options)
  const removals: Promise<void>[] = []
  if ("onOpenChangeComplete" in schemaOf(primitive).options) {
    exits.set(instance, removals)
  }
  const resolve = (next: Record<string, unknown>) => {
    const resolved = bindable.resolve(next)
    const complete = next.onOpenChangeComplete
    if (typeof complete === "function") {
      resolved.onOpenChangeComplete = (open: boolean) => {
        const pending = removals.splice(0)
        if (open || !pending.length) {
          return complete(open)
        }
        void Promise.all(pending).then(() => complete(open))
      }
    }
    return resolved
  }
  // Leaving the page settles a pending controller `open()` and detaches the
  // controller. On the server this runs once the component has rendered.
  onDestroy(() => instance.destroy())
  // The options as the instance takes them, made again when a prop changes.
  // A key the parent doesn't control stays unread (`controlledOnly`).
  const current = $derived(
    snapshot({ ...bindable.controlledOnly(options()), id: prefixed })
  )
  // The instance's state reads what the props deliver, like a controlled
  // `value`, from here: a read sees it in the same update as the parent's own
  // state, before the effect below hands it over. Untracked, or every part
  // would hear every prop.
  let seen: typeof current | undefined
  const delivered = instance.follow(() =>
    tearingDown && seen ? seen : (seen = untrack(() => current))
  )
  // What the props changed in it, counted by the names parts read it by
  // (`followed`). Each part compares its own counts, so a value moving
  // between two of 500 items updates two. Both sides read the state held
  // now, so parts hear from the store what state changed since.
  // The derived itself is how many names changed, so props that change
  // nothing parts read, like a layout bound back, reach none.
  const counts: Record<string, number> = {}
  let changes = 0
  let before: typeof current | undefined
  const marks = $derived.by(() => {
    const next = current
    untrack(() =>
      touched(before && delivered(undefined, before), delivered(), (name) => {
        counts[name] = (counts[name] ?? 0) + 1
        changes++
      })
    )
    before = next
    return changes
  })
  deliveries.set(instance, (part) => {
    marks
    return followed(part, untrack(delivered), part.props)
      .map((name) => counts[name] ?? 0)
      .join()
  })
  // Hands the options to the instance before the DOM updates. What they change
  // is counted first, against the state before them, so parts hear a key
  // derived from that state too, like a drawer's snap point.
  $effect.pre(() => {
    marks
    instance.setOptions({ ...resolve(snapshot(options())), id: prefixed })
  })
  const handle: PrimitiveHandle<P> = {
    instance,
    // Read when used, since reading it wakes an asleep instance.
    get api() {
      return instance.api as TypesOf<P>["api"]
    },
    controls: bindable.controls,
    get state() {
      return instance.get() as TypesOf<P>["state"]
    },
  }
  return handle
}

/**
 * Where a popup renders: an element or fragment, or nothing to render in place.
 * @stable
 */
type PopupContainer = Element | DocumentFragment | null | undefined

/**
 * Moves a part's element where it renders, for `usePart`'s `portal`, and
 * returns how to put it back, if it moved. Make one with `portalTo`.
 * @stable
 */
type Portal = (el: HTMLElement) => (() => void) | void

/** What `slot()` returns: the attributes to spread on the part's element, with the attachment that binds it. */
type SlotAttributes = {
  [key: string]: unknown
  [key: symbol]: Attachment<HTMLElement> | undefined
}

/**
 * One part of a component: its presence, attributes, state and the attachment that binds its element.
 * @stable
 */
type Part<P extends Primitive, S extends SlotName<P>> = {
  /** Whether the part's element should exist. Reading it in a template tracks it. */
  readonly present: boolean
  /** The part's attributes alone, like its `id` for another part to point at. Reading it tracks them. */
  readonly attrs: Attrs
  /** The part's state for snippets. Reading a key tracks that key, and only that key. */
  readonly state: StateOf<P, S>
  /**
   * Attributes and the attachment for the part's element, merged with the
   * user's props. User listeners run first and can call `preventDefault()`
   * to skip the built-in behavior. Reading it in a template tracks the
   * part's attributes.
   */
  slot: (user?: Record<string, unknown>) => SlotAttributes
}

// What `<Part>` takes beside the attributes, which `slot()` leaves off the element.
const partProps = new Set(["render", "children"])

function withoutPartProps(props: Record<string, unknown>) {
  const result: SlotAttributes = { ...props }
  for (const key of partProps) {
    delete result[key]
  }
  return result
}

// Attributes in `skip` may differ.
function sameAttrs(a: Attrs, b: Attrs, skip: readonly string[] = []) {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key] || skip.includes(key))
  )
}

// Later styles win, so a part's own inline styles beat the user's.
function mergeStyles(user: unknown, own: string | undefined) {
  if (!own) {
    return user
  }
  if (typeof user === "string" && user) {
    return `${user.replace(/;\s*$/, "")};${own}`
  }
  return own
}

/**
 * Subscribes a part to its instance: it updates its attributes only when
 * they or its presence change, and its state only for the keys a snippet
 * read, so toggling one option updates that option, not all, and a
 * highlight change reaches only snippets that read `highlighted`. `props`
 * is a getter: a part that takes another key, or new values to select on,
 * subscribes again. `owner` may be a getter too: a trigger given another
 * controller subscribes to that instance and binds the same element again,
 * so it keeps its focus. `portal`, from `portalTo`, moves a popup into its container.
 */
function useHandlePart<P extends Primitive, S extends SlotName<P>>(
  owner: PrimitiveHandle<P> | (() => PrimitiveHandle<P>),
  name: S,
  props: () => PropsOf<P, S> = () => ({}) as PropsOf<P, S>,
  portal?: Portal
) {
  const handleOf = typeof owner === "function" ? owner : () => owner
  // Read where it's used, so a getter's change reaches the effect and deriveds that read it.
  const instanceOf = () => handleOf().instance
  // The instance the part is subscribed to, which its listener and element binding use.
  let instance = untrack(instanceOf)
  // Bumped when the attributes or presence changed, and when a read state key did.
  let tick = $state(0)
  let stateTick = $state(0)
  // What the last render showed, which the listener compares against.
  let shown: { attrs: Attrs; present: boolean } | undefined
  let version = renderVersion(instance)
  // The state keys snippets read, and the snapshot they read them from.
  const read = new Set<string>()
  let snapshot: Record<string, unknown> | undefined
  // The user's props from the last `slot()` call, for its listeners.
  let user: Record<string, unknown> = {}
  // The DOM event types the core handles on this part. Constant per slot.
  const handled = new Set(
    Object.keys(partHandlers(untrack(() => instance.part(name, props())))).map(
      (type) => `on${type}`
    )
  )

  // The core notifies from anywhere, a part's own `bind` included, which runs
  // inside its attachment's effect. Nothing read here, the ticks' own reads
  // in `++` included, may become that effect's dependency, or the attachment
  // would bind the element again on every later change: a toast region that
  // mounts with toasts to show refreshed its list from `bind` without end.
  const check = (liveOnly: boolean, delivered: boolean) =>
    untrack(() => {
      // Parts read what the props deliver themselves (`delivery` below).
      if (delivered) {
        return
      }
      const current = instance.part(name, props())
      if (read.size && snapshot) {
        const next = partState(current) as Record<string, unknown>
        for (const key of read) {
          if (sameSlotState(next[key], snapshot[key])) {
            continue
          }
          snapshot = next
          // The render this causes reads its keys again.
          read.clear()
          stateTick++
          break
        }
      }
      if (!shown) {
        return
      }
      // Presence may read live state, so it is checked on every change.
      const present = isPresent(current)
      // Back in its block before Svelte removes it. The core can notify again
      // before Svelte renders, so each removal is waited for once.
      if (!present && shown.present) {
        restore()
        restored = bound
        if (portal && bound && !removed) {
          exits
            .get(instance)
            ?.push(new Promise((resolve) => (removed = resolve)))
        }
      }
      // Present again before Svelte removed it, like a navigation menu's
      // content as its viewport binds again: it goes back where it renders.
      if (present && restored && restored === bound) {
        back = portal?.(restored)
      }
      if (present) {
        restored = undefined
      }
      // Present again before Svelte removed it: reopened, that close never
      // completes; still closed, like a select's list kept in the page
      // hidden, the close is done.
      if (present && removed) {
        if (!(instance.get() as { open?: boolean }).open) {
          removed()
        }
        removed = undefined
      }
      if (present !== shown.present) {
        return void tick++
      }
      // Live state changes no attributes, so there's nothing to compare. Core
      // writes a slot's `direct` attributes to the element itself.
      if (liveOnly) {
        return
      }
      const latest = renderVersion(instance)
      if (latest === version) {
        return
      }
      version = latest
      if (!sameAttrs(partAttrs(current), shown.attrs, directNames(current))) {
        tick++
      }
    })

  // How to put a popup that moved into its container back in its block,
  // before Svelte removes the block, once.
  let back: (() => void) | void
  const restore = () => {
    back?.()
    back = undefined
  }
  // Svelte unbinds a part's element as it removes it, once its outros end.
  let removed: (() => void) | undefined
  // The element put back in its block while the part wasn't present.
  let restored: HTMLElement | undefined

  // Binds the element: moves a popup into its container first, so the core
  // binds it where it lives, then the core's ref and the merged listeners.
  // Made anew when the part takes another key, so the element binds again.
  const createAttachment = () => (el: HTMLElement) => {
    // Tracked, so a new container moves the element and binds it again.
    back = portal?.(el)
    const current = untrack(() => instance.part(name, props()))
    const ref = partRef(current, { by: "framework", attaches: "all" })
    ref(el)
    bound = el
    // The declarations the spread wrote are recorded, so a later change can drop them.
    if (typeof styleShown === "string") {
      applyAttrs(el, { style: styleShown }, "svelte-style")
    }
    const cleanups = Object.entries(partHandlers(current)).map(
      ([type, handler]) =>
        on(el, type as keyof HTMLElementEventMap, (event) => {
          const own = user[`on${type}`]
          if (typeof own === "function") {
            own(event)
          }
          if (event.defaultPrevented) {
            return
          }
          // Chrome fires `focusout` as Svelte removes a focused element, inside
          // the effect removing it, where a write throws. The core hears it after.
          if ($effect.tracking()) {
            queueMicrotask(() => el.isConnected && handler!(event))
          } else {
            handler!(event)
          }
        })
    )
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      bound = undefined
      tearingDown++
      try {
        ref(null)
      } finally {
        tearingDown--
      }
      restore()
      removed?.()
      removed = undefined
    }
  }
  // The element the part is bound to, for `slot()` to write styles on.
  let bound: HTMLElement | undefined
  // The merged style string the last `slot()` call produced.
  let styleShown: unknown
  // Svelte writes a changed `style` string as `cssText`, which would drop the
  // declarations the core wrote on the element from `bind`, like a resizable
  // panel's size or a hidden scrollbar's `pointer-events`. Once the element
  // is bound, the merged style is written property by property, and what the
  // element shows is what Svelte gets, so its write changes nothing.
  const styleFor = (merged: unknown) => {
    styleShown = merged
    if (!bound) {
      return merged
    }
    // A style that goes away takes what it wrote with it, even when the owner
    // left `style` out of its spread and Svelte writes nothing.
    if (typeof merged !== "string") {
      applyAttrs(bound, { style: undefined }, "svelte-style")
      return merged
    }
    applyAttrs(bound, { style: merged }, "svelte-style")
    return bound.style.cssText
  }
  let attachment = $state.raw<Attachment<HTMLElement>>()
  let subscribed: ReturnType<typeof instance.part> | undefined
  let selected: string | undefined
  let unsubscribe = () => {}
  // Before the DOM updates, so the first render is subscribed. Runs again
  // when the props change, and subscribes again only when the part, or the
  // values it selects on, do.
  $effect.pre(() => {
    const owned = instanceOf()
    const current = owned.part(name, props())
    const values = selectedKeys(current)
    if (current === subscribed && values === selected) {
      return
    }
    instance = owned
    subscribed = current
    selected = values
    unsubscribe()
    unsubscribe = subscribe(current, check)
    attachment = createAttachment()
  })
  onDestroy(() => unsubscribe())

  // What the part reads of the props' delivery: changes when one of its own names does.
  const delivery = $derived.by(() => {
    const owned = instanceOf()
    return deliveries.get(owned)?.(owned.part(name, props()))
  })
  // Read without tracking: state reads the props, which every part would otherwise hear.
  const rendered = $derived.by(() => {
    tick
    delivery
    const owned = instanceOf()
    const current = owned.part(name, props())
    return untrack(() => {
      const attrs = partAttrs(current)
      const present = isPresent(current)
      version = renderVersion(owned)
      shown = { attrs, present }
      return { attrs, present }
    })
  })
  // A boolean of its own: a part that reads another's presence, like content
  // whose portal depends on its viewport, then hears only when it flips, not
  // on every attribute change, which would bind its element again mid-exit.
  const present = $derived(rendered.present)
  const attach = createAttachmentKey()

  const part: Part<P, S> = {
    get present() {
      return present
    },
    get attrs() {
      return rendered.attrs
    },
    state: new Proxy({} as StateOf<P, S>, {
      get(_, property) {
        stateTick
        delivery
        const current = instanceOf().part(name, props())
        snapshot = untrack(() => partState(current)) as Record<string, unknown>
        if (typeof property === "string") {
          read.add(property)
        }
        return snapshot[property as string]
      },
    }),
    slot(attributes = {}) {
      user = attributes
      if (attributes.id != null) {
        takeOwnId(
          untrack(() => instance.part(name, props())),
          attributes.id
        )
      }
      const result: SlotAttributes = {}
      // The core's listeners for a type run from the attachment, after the
      // user's. Other listeners go through Svelte as they are.
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && !handled.has(key) && !partProps.has(key)) {
          result[key] = value
        }
      }
      // Attachments merged in, like a control's own under a field's.
      for (const key of Object.getOwnPropertySymbols(attributes)) {
        result[key] = (attributes as SlotAttributes)[key]
      }
      // Attributes left undefined are absent, so they never replace a value merged
      // in, like a field's on its control. An `id` the user gives, and what
      // `yieldToAuthor` leaves to the user, stay the user's.
      const own = yieldToAuthor(
        rendered.attrs,
        (key) => attributes[key] != null
      )
      for (const [key, value] of Object.entries(own)) {
        if (value !== undefined && !(key === "id" && attributes.id != null)) {
          result[key] = value
        }
      }
      if ("style" in rendered.attrs) {
        result.style = styleFor(
          mergeStyles(attributes.style, rendered.attrs.style)
        )
      }
      result[attach] = attachment
      return result
    },
  }
  return part
}

/** What `<Part>` renders from: the attributes `slot()` merges with the user's props, and the state its snippets receive. Every `Part` is one. */
type PartBinding<State> = {
  slot: (user: Record<string, unknown>) => SlotAttributes
  readonly state: State
}

/**
 * A part with no instance behind it, like a trigger outside its component
 * until the component mounts: the user's props over `defaults`, and a fixed
 * state.
 */
function plainPart<State>(
  state: State,
  defaults: Record<string, unknown> = {}
) {
  return {
    slot: (user: Record<string, unknown>) =>
      withoutPartProps({ ...defaults, ...user }),
    state,
  }
}

/** The part with its attributes passed through `wrap`, like a control's merged with its field's. */
function wrapPart<State>(
  part: PartBinding<State>,
  wrap: ((attributes: SlotAttributes) => SlotAttributes) | undefined
) {
  if (!wrap) {
    return part
  }
  return {
    slot: (user: Record<string, unknown>) => wrap(part.slot(user)),
    state: part.state,
  }
}

/**
 * Props every part takes: its element's attributes, the `render` snippet and
 * `children`, which receives the part's state. Any other attribute passes
 * through too, for the element `render` renders, like `href` on a close
 * button rendered as a link. `Own` names the element's attributes the part
 * types itself, like Button's `onclick`: `Omit` can't remove them, since
 * the props take any attribute.
 * @stable
 */
type PartProps<
  Tag extends keyof SvelteHTMLElements,
  State = {},
  Own extends string = never,
> = Omit<SvelteHTMLElements[Tag], "children" | Own> & {
  [attribute: string]: unknown
} & {
  /**
   * Renders your own element. Receives the props to spread on it, the part's
   * state, and its content, like a slider thumb's range input, which
   * `{@render children?.(state)}` renders inside.
   */
  render?: Snippet<
    [{ props: SlotAttributes; state: State; children?: Snippet<[State]> }]
  >
  /** Content. Receives the part's state. */
  children?: Snippet<[State]>
}

export {
  type Part,
  type PartBinding,
  type PartProps,
  plainPart,
  type PopupContainer,
  type Portal,
  type PrimitiveHandle,
  type SlotAttributes,
  useHandlePart,
  usePrimitive,
  wrapPart,
}
