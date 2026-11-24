// Finds a component from outside its tree through its controller, like a
// trigger in a table row that opens a popover elsewhere, or a scrub area in a
// toolbar that drives a number input.
import type { Primitive } from "@ui-sdk/core"
import {
  effectScope,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  watchPostEffect,
  type EffectScope,
  type InjectionKey,
  type Slots,
} from "vue"
import {
  renderElement,
  useHandle,
  useScope,
  type PrimitiveHandle,
} from "./use-primitive"

// Instances driven by a controller, so parts outside the component, like a
// trigger in a table row, can find them.
const controlled = new WeakMap<object, ReturnType<typeof shallowRef<unknown>>>()

function controlledRef(controller: object) {
  let current = controlled.get(controller)
  if (!current) {
    controlled.set(controller, (current = shallowRef<unknown>(undefined)))
  }
  return current
}

/**
 * The component a part of `primitive` connects to: the one its controller is
 * attached to, from anywhere on the page, or else the one it sits in. So a
 * trigger inside one dialog that names another's controller opens the other,
 * once that one mounts. Reading it in a render tracks it, so a part renders
 * again once the component mounts. Call in `setup`.
 */
function useControllerTarget<P extends Primitive>(
  primitive: P,
  controller: () => object | undefined
) {
  const nearest = useScope(primitive)?.handle
  return () => {
    const current = controller()
    return (
      (current &&
        (controlledRef(current).value as PrimitiveHandle<P> | undefined)) ??
      nearest
    )
  }
}

// Registers a popup with its controller, so triggers outside it can find it.
// It registers after mount, like React's layout effect: the server never runs
// it, so a trigger's first client render stays the plain button the server
// rendered, and hydration matches before the trigger binds.
function useControllerEntry(
  controller: () => object | undefined,
  value: unknown
) {
  watchPostEffect((onCleanup) => {
    const current = controller()
    if (!current) {
      return
    }
    const entry = controlledRef(current)
    entry.value = value
    onCleanup(() => {
      if (entry.value === value) {
        entry.value = undefined
      }
    })
  })
}

// The component a trigger outside it connects to, for the parts inside the trigger.
const connectedKeys = new WeakMap<
  Primitive,
  InjectionKey<() => PrimitiveHandle<Primitive> | undefined>
>()

function connectedKey(primitive: Primitive) {
  let key = connectedKeys.get(primitive)
  if (!key) {
    connectedKeys.set(primitive, (key = Symbol(`${primitive.name}-connected`)))
  }
  return key
}

/**
 * Shares the component a trigger connects to through its controller with the
 * parts inside the trigger, like a select's value, in its default slot or its
 * `render` slot. Call in the trigger's `setup`.
 */
function provideConnected<P extends Primitive>(
  primitive: P,
  handle: () => PrimitiveHandle<P> | undefined
) {
  provide(
    connectedKey(primitive),
    handle as () => PrimitiveHandle<Primitive> | undefined
  )
}

/**
 * The component of a part that may sit inside a trigger: the one the trigger
 * connects to, undefined until that one mounts, or else its root's. Render it
 * with `useConnectedPart`. Throws outside both, like `useHandle`. Call in `setup`.
 */
function useConnectedHandle<P extends Primitive>(primitive: P) {
  const connected = inject(connectedKey(primitive), null)
  if (connected) {
    return connected as () => PrimitiveHandle<P> | undefined
  }
  const handle = useHandle(primitive)
  return () => handle
}

/**
 * A part whose component isn't known yet, like a trigger a controller
 * connects before its popup mounts: its element without a part, rendered the
 * way a part renders, with a neutral `state` for its slots and `children`, its
 * own content, like a value's placeholder.
 */
function renderUnbound<State extends object>(
  tag: string,
  props: Record<string, unknown>,
  {
    slots,
    state,
    children,
  }: { slots: Slots; state: State; children?: (state: State) => unknown }
) {
  return renderElement(props, slots, state, { tag, children })
}

// A handle that remembers the ref its part last handed out, so that part can
// let go of the element when another component takes it over: Vue calls a new
// function ref with the element, but never calls the one it replaces.
function watchedRefs<H extends PrimitiveHandle<Primitive>>(handle: H) {
  let lastRef: ((el: unknown) => void) | undefined
  const watched: H = Object.create(handle)
  watched.slot = (name, props, user) => {
    const result = handle.slot(name, props, user)
    lastRef = result.ref
    return result
  }
  return { handle: watched, release: () => lastRef?.(null) }
}

/**
 * Renders a part that may find its component through a controller, like a
 * trigger outside its popup: `unbound` until `handle()` gives a component,
 * then the render `bind` makes for that component, the way `usePart` makes
 * one in setup. Both render from this one component, which binds again when
 * the component changes, so the element, and the focus on it, stay. Call in
 * `setup`; it returns the render function.
 */
function useConnectedPart<H extends PrimitiveHandle<Primitive>>(
  handle: () => H | undefined,
  bind: (handle: H) => () => unknown,
  unbound: () => unknown
) {
  let current: H | undefined
  let bound:
    | { scope: EffectScope; render: () => unknown; release: () => void }
    | undefined
  onScopeDispose(() => bound?.scope.stop())
  return () => {
    const next = handle()
    if (next !== current) {
      current = next
      bound?.release()
      bound?.scope.stop()
      bound = next && bindTo(next, bind)
    }
    return bound ? bound.render() : unbound()
  }
}

// Makes `bind`'s render in a scope of its own, which stops when the component
// changes, so the part's subscriptions end with it.
function bindTo<H extends PrimitiveHandle<Primitive>>(
  handle: H,
  bind: (handle: H) => () => unknown
) {
  const scope = effectScope(true)
  const watched = watchedRefs(handle)
  const render = scope.run(() => bind(watched.handle))!
  return { scope, render, release: watched.release }
}

export {
  provideConnected,
  renderUnbound,
  useConnectedHandle,
  useConnectedPart,
  useControllerEntry,
  useControllerTarget,
}
