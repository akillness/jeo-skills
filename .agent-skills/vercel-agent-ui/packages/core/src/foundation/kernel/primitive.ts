// `definePrimitive`: a component's behavior without its markup, and the
// instances adapters make of it. Its types are in `primitive-types.ts`.
import {
  checkControlled,
  checkRoles,
  dev,
  emit,
  isMeasuring,
  warn,
  warnMissing,
} from "#dev"
import { connectController } from "./controller"
import { withDerived } from "./derive"
import { withSource, type ChangeSource } from "./details"
import {
  discard,
  extendLifecycle,
  whileDestroying,
  withLifecycle,
} from "./keep"
import {
  propsRendered,
  provisional,
  type PartOwner,
  type PartRecord,
} from "./part"
import type {
  AnySlot,
  BaseSlotProps,
  ControlledBy,
  Feature,
  OptionsSchema,
  Part,
  Primitive,
  PrimitiveContext,
  PrimitiveInstance,
  PrimitiveSchema,
  PropSpec,
  SlotFactory,
  SlotProps,
} from "./primitive-types"
import { createStore, heldState, renders, sameValue, standFor } from "./store"
import { watchWhileKept } from "./watchers"

/**
 * Defines a component's behavior without its markup: its state, an api that
 * changes it, and its parts, called slots. Every adapter renders the result
 * with `createParts`, which reads `options` and each slot's `props` to tell
 * them from an element's own. Each slot's element gets `data-slot="<name>-<slot>"`,
 * and the `root` slot's gets `data-slot="<name>"`.
 *
 * @example
 * export const disclosure = definePrimitive({
 *   name: "disclosure",
 *   options: { open: "boolean", defaultOpen: "boolean", onOpenChange: "callback" },
 *   state: (options: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean, details: ChangeDetails<"trigger-press">) => void }) => ({
 *     open: options.open ?? options.defaultOpen ?? false,
 *   }),
 *   sync: (options) => (options.open === undefined ? {} : { open: options.open }),
 *   api: (context) => {
 *     const change = createChange(context)
 *     return { toggle: (event?: Event) => change("open", !context.store.get().open, { reason: "trigger-press", event }) }
 *   },
 *   slots: (slot) => ({
 *     trigger: slot({
 *       attrs: (state) => ({ type: "button", "aria-expanded": String(state.open) }),
 *       press: ({ api }, event) => api.toggle(event),
 *     }),
 *     panel: slot({ present: (state) => state.open }),
 *   }),
 * })
 * @stable
 */
function definePrimitive<
  Options extends object,
  State extends object,
  Api extends ControlledBy<Options>,
  Slots extends Record<string, AnySlot>,
>(
  definition: {
    /** Prefixes `data-slot`, and names the component in warnings and the devtools. Kebab case. */
    name: string
    /** The starting state, from the first options. Read `default<Key>` here. */
    state: (options: Options) => State
    /** State keys that change often and never affect rendering, like a highlighted item. */
    live?: (keyof State)[]
    /**
     * Whether an instance with these options starts asleep: its parts render
     * and run `asleep`, while its api and each part's `bind` wait for the first
     * event a part handles or the first read of `instance.api`. Like a closed
     * tooltip, which costs little until its trigger is hovered or focused.
     * @experimental
     */
    asleep?: (options: Options) => boolean
    /** Maps controlled options onto state. Runs whenever options change. */
    sync?: (options: Options) => Partial<State>
    /**
     * State keys a user can control with `<key>`, `default<Key>` and
     * `on<Key>Change`. Development builds warn when one starts with both `<key>`
     * and `default<Key>`, or was controlled and becomes undefined. Defaults
     * to whichever of `open`, `value` and `checked` the state has.
     */
    controlled?: (keyof State & string)[]
    /**
     * State keys an interaction changes in steps and then commits, through
     * `createCommit`, like a slider's `value` while it's dragged. `observe`
     * reports each of them once per commit rather than per step.
     * @experimental
     */
    commits?: (keyof State & string)[]
    /** Runs once per instance and returns its api, which slots, adapters and a controller call. */
    api: (context: PrimitiveContext<Options, State, string>) => Api
    /** The parts, built with `slot`. `slot<Props, State>({ ... })` types a slot's props and the state its render functions get. */
    slots: (slot: SlotFactory<State, Api>) => Slots
    /**
     * What warnings, `debug` and the devtools call it, when that isn't `name`,
     * which prefixes `data-slot`. Like a checkbox group's parts in `checkbox`.
     */
    label?: string
    /**
     * What `@ui-sdk/core/agent` offers an agent. Without it, the agent takes
     * the api's methods that change something by their names, like `setValue`.
     * @experimental
     */
    agent?: {
      /** The api methods an agent may call, like `["setValue", "setOpen"]`. Development builds warn about one the api lacks. */
      actions?: string[]
      /** Its value is always one of its items, so text that names none is a mistake to refuse. */
      closed?: boolean
      /** Its items as data, when they aren't its state's `items`, like a tree's built from `paths`. */
      items?: (api: NoInfer<Api>) => unknown
      /** Its closed items hide other components, like tabs, which a step can open first. */
      reveals?: boolean
      /** Whether an agent sees it now, like a field only while it has errors. */
      shown?: (state: NoInfer<State>) => boolean
      /** Its value is hidden from agents and `observe`, like a password's. */
      secret?: boolean
    }
  } & OptionsSchema<Options>
) {
  const slots = definition.slots((slot) => slot)
  const name = definition.name
  const label = definition.label ?? name
  if (dev) {
    checkRoles(slots as Record<string, object>, { component: label })
  }
  type Slot = keyof Slots & string

  const make = (initialOptions: Options & { id: string }) => {
    let options = initialOptions
    const id = initialOptions.id
    const store = createStore(
      { ...definition.state(options), ...definition.sync?.(options) },
      definition.live ?? []
    )
    const destroys: (() => void)[] = []
    const optionsListeners: Parameters<
      PrimitiveContext<Options, State, Slot>["onOptions"]
    >[0][] = []
    // Development code below is behind `dev`, so production builds drop it
    // with its arguments. `from` names the instance in warnings and the devtools.
    const from = { component: label, id }
    const controlled = dev
      ? (definition.controlled ?? ["open", "value", "checked"]).filter(
          (key) => key in store.get()
        )
      : []
    if (dev) {
      checkControlled(from, controlled, options)
    }

    const own: Record<string, AnySlot> = Object.create(
      dev ? warnMissing(slots, from) : slots
    )
    const used = new Set<Feature>()
    function use(feature: Feature<Api>) {
      if (used.has(feature)) {
        return
      }
      used.add(feature)
      Object.assign(own, feature.slots)
      wake()
      feature.extend?.(api)
    }

    const owner: PartOwner = {
      name,
      label,
      slots: own,
      parts: new Map(),
      released: [],
    }
    const { parts } = owner

    // A value of any type keys its part, so items valued 1 and 2 are two parts.
    function keyOf(props: BaseSlotProps & { value?: unknown } = {}) {
      return props.id ?? (props.value == null ? "" : String(props.value))
    }

    // Inside `view`, the props a framework renders the parts around the one
    // it's rendering with, by slot, before it commits them.
    let viewedParts:
      Record<string, BaseSlotProps & { value?: unknown }> | undefined

    // What an adapter calls as it renders a part: the part for `props`, made
    // and kept if it's new, with `props` as its newest render's, and its
    // `onProps` listeners run. A framework that may throw a render away, like
    // React, passes `rendering`: the part keeps the props it committed, which
    // its handlers and the parts around read, until `commit()`.
    function part<S extends Slot>(
      slot: S,
      props: SlotProps<Slots[S]> = {} as never,
      rendering = false
    ) {
      const key = keyOf(props)
      const mapKey = `${slot}:${key}`
      let found = parts.get(mapKey)
      if (!found) {
        parts.set(
          mapKey,
          (found = {
            slot,
            key,
            id,
            // Read when used, since an asleep instance builds its api later.
            get api() {
              return api
            },
            store,
            props,
            el: undefined,
            owner,
            leases: 0,
          })
        )
        if (rendering) {
          provisional(found as PartRecord)
        }
      } else if (rendering) {
        return found as Part<State, Api, SlotProps<Slots[S]>>
      }
      found.props = props
      propsRendered(found)
      return found as Part<State, Api, SlotProps<Slots[S]>>
    }

    // Only an element in the page: one a framework removed can stay bound
    // until its cleanup runs.
    function element(slot: Slot, key?: string) {
      if (key === undefined) {
        for (const part of parts.values()) {
          if (part.slot === slot && part.el?.isConnected) {
            return part.el
          }
        }
        return
      }
      const el = parts.get(`${slot}:${key}`)?.el
      return el?.isConnected ? el : undefined
    }

    const context: PrimitiveContext<Options, State, string> = {
      id,
      label,
      store,
      options: () => options,
      onOptions: (listener) => optionsListeners.push(listener),
      onDestroy: (cleanup) => destroys.push(cleanup),
      parts: () => parts.values(),
      element,
      props: (slot, key = "") => {
        const shown = viewedParts?.[slot]
        return shown && keyOf(shown) === key
          ? shown
          : parts.get(`${slot}:${key}`)?.props
      },
    }
    let api = undefined as unknown as Api
    function build() {
      api = definition.api(context)
      connectController(context, api)
      if (dev) {
        for (const action of definition.agent?.actions ?? []) {
          if (typeof (api as Record<string, unknown>)[action] !== "function") {
            warn(
              `lists \`${action}\` in \`agent.actions\`, but its api has no such method.`,
              from
            )
          }
        }
      }
    }
    // Asleep, parts render and run `asleep`, and the api and each `bind` wait
    // for the first event a part handles, or the first read of the api.
    function wake() {
      const { sleeping } = owner
      if (!sleeping) {
        return
      }
      owner.sleeping = undefined
      extendLifecycle(instance, build)
      for (const bind of [...sleeping.binds]) {
        bind()
      }
    }
    if (definition.asleep?.(options)) {
      owner.sleeping = { wake, binds: new Set() }
    } else {
      build()
    }

    // Whether `setOptions` is handing options over, and whether a framework
    // reads them before it does, through `follow`.
    let handing = false
    let following = false
    let destroyed = false
    // What `sync` makes of `options`, with what the component derives from
    // it given `state`, the state before.
    const syncFrom = (options: Options, state: State) =>
      withDerived(store, options, definition.sync?.(options), state)
    const instance = {
      // Type-only. Lets adapters read slot props, state and api types.
      types: undefined as unknown as {
        options: Options
        state: State
        api: Api
        slots: Slots
      },
      name,
      id,
      get: store.get,
      subscribe: store.subscribe,
      get api() {
        wake()
        return api
      },
      part,
      use,
      // The state `next` would make, or undefined when it makes none new, so
      // a framework can render a controlled value before it commits it.
      preview(next: Options & { id: string }) {
        const synced = syncFrom({ ...next, id }, store.get()) as
          Record<string, unknown> | undefined
        const current = store.get() as Record<string, unknown>
        for (const key in synced) {
          if (!sameValue(current[key], synced[key])) {
            return { ...current, ...synced } as State
          }
        }
      },
      // Runs `read` with `get()` returning `state`, and the api reading the
      // parts in `around` with the props given there, so a framework that
      // renders a preview reads the api, like a list's items or a radio
      // group's value, from it too.
      view<T>(state: State, read: () => T, around?: Record<string, object>) {
        const outer = viewedParts
        viewedParts = around
        try {
          return store.view(state, read)
        } finally {
          viewedParts = outer
        }
      },
      setOptions(next: Options & { id: string }) {
        const held = heldState(store)
        const arriving = next.id === id ? next : { ...next, id }
        // What `follow` showed of these options, while the instance still had the last ones.
        const shown = dev && following ? syncFrom(arriving, held) : undefined
        options = arriving
        if (dev) {
          checkControlled(from, controlled, options)
        }
        // Options that need it awake, like a controller attached once React commits.
        if (owner.sleeping && !definition.asleep!(options)) {
          wake()
        }
        const synced = syncFrom(options, held)
        if (dev && shown) {
          const torn = tornKeys(shown, synced)
          if (torn.length) {
            emit({ type: "relay", ...from, keys: torn })
          }
        }
        let source: ChangeSource | undefined
        handing = true
        try {
          for (const listener of optionsListeners) {
            source = listener(options, synced) ?? source
          }
          // A listener's write lands what `follow` delivers first, with what
          // that sets off, like a close whose exit ended at once. Synced from
          // the state before, the options would undo it.
          const landing =
            heldState(store) === held
              ? synced
              : syncFrom(options, heldState(store))
          if (landing) {
            withSource(source, () => store.set(landing, true))
          }
        } finally {
          handing = false
        }
      },
      // The state a new instance with `next` would start at. The web adapter
      // reads a form reset's defaults from it when properties set before
      // connecting started an element elsewhere.
      startState: (next: Options & { id: string }) =>
        definition.state({ ...next, id }),
      // Reads the keys `sync` makes from `current`, a framework's props, from
      // now on: state has them the moment the props change, before
      // `setOptions` hands them over from an effect, and parts the framework
      // renders read them through it rather than hear the store. Pass the same
      // object while the props stay the same. Returns a read of what `sync`
      // makes of them. Given the options an earlier read had as `before`, it
      // reads what those make of the same state, so a framework tells what
      // the props changed from what state did.
      follow(current: () => Options & { id: string }) {
        following = true
        let last: { options: object; state: State } | undefined
        let synced: Partial<State> | undefined
        const read = (state = heldState(store), before?: Options) => {
          if (before) {
            return syncFrom({ ...before, id }, state)
          }
          // Once the instance is destroyed, what it reads, like a checkbox
          // group counting its checkboxes after they left, keeps what the
          // framework last delivered: the framework's values may have gone
          // with the component, like a Svelte `$derived` of its effects.
          if (destroyed) {
            return synced
          }
          const options = current()
          if (last?.options !== options || last.state !== state) {
            last = { options, state }
            synced = syncFrom({ ...options, id }, state)
          }
          return synced
        }
        store.follow(read)
        // What the options change besides the keys they deliver, parts hear
        // inside the effect that handed them over.
        if (dev) {
          store.subscribe((_, delivered, keys) => {
            if (handing && !delivered && !isMeasuring()) {
              emit({ type: "relay", ...from, keys: [...keys] })
            }
          })
        }
        return read
      },
      // The instance left the page. Stops what it started outside itself for
      // good, then runs its `onDestroy` callbacks, which settle what waits on
      // it, like a popup's pending `open()`. Adapters call it once the
      // component unmounts, and a second call does nothing.
      destroy() {
        if (destroyed) {
          return
        }
        destroyed = true
        discard(instance)
        whileDestroying(() => destroys.forEach((cleanup) => cleanup()))
        if (dev) {
          emit({ type: "instance", action: "destroy", ...from, controlled })
        }
      },
    }
    standFor(instance, store)
    watchWhileKept(instance, parts, definition)
    if (dev) {
      emit({ type: "instance", action: "create", ...from, controlled })
    }
    return instance
  }
  const create = (initialOptions: Options & { id: string }) =>
    withLifecycle(() => make(initialOptions))
  // Named like its instances, so renderers can name its parts, like `TabsList`.
  // Its options schema and slots are for renderers, which read the schema
  // with `schemaOf`, so primitives no renderer reads that way pay nothing for it.
  Object.defineProperty(create, "name", { value: name })
  return Object.assign(create, {
    options: definition.options as Record<string, PropSpec> | undefined,
    slots,
  })
}

// The keys `follow` showed with another value than the handover lands, which
// the framework rendered for a pass, like state derived from options read
// from the instance instead of the arriving ones. Development only.
function tornKeys(shown: object, landed: object | undefined) {
  const before = shown as Record<string, unknown>
  const after = (landed ?? {}) as Record<string, unknown>
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((key) => !sameValue(before[key], after[key]))
}

const schemas = new WeakMap<Primitive, PrimitiveSchema>()

/** A primitive's options and each slot's props, by name and kind. */
function schemaOf(primitive: Primitive) {
  let schema = schemas.get(primitive)
  if (!schema) {
    const { options, slots = {} } = primitive
    schema = {
      options: { debug: "boolean", ...options },
      slots: Object.fromEntries(
        Object.entries(slots as Record<string, AnySlot>).map(([slot, def]) => [
          slot,
          def.props ?? {},
        ])
      ),
    }
    schemas.set(primitive, schema)
  }
  return schema
}

/**
 * A number that changes with every change to an instance's state that can
 * change what renders, which a change to live keys alone never is, so a
 * renderer can tell whether to look again.
 */
const renderVersion = (instance: PrimitiveInstance) => renders(instance)

export { definePrimitive, renderVersion, schemaOf }
