// The types a primitive is made of: its options and their kinds, its slots
// and parts, the context its api gets, and what adapters derive from it.
import type { ChangeSource } from "./details"
import type { Direct, Live } from "./live"
import type {
  AriaOf,
  Focus,
  FocusableRole,
  HandledKey,
  KeyedRole,
  NamelessRole,
  PressableRole,
  RequiredAria,
  Role,
  RoleAria,
  Unneeded,
} from "./roles"
import type { Selects } from "./selects"
import type { Store } from "./store"

/**
 * HTML attributes as the DOM sees them. Strings only, undefined removes.
 * Boolean attributes use "" for present, like in markup.
 * @stable
 */
type Attrs = Record<string, string | undefined>

/**
 * Props every slot accepts. `id` identifies one element among many in the same slot.
 * @stable
 */
type BaseSlotProps = { id?: string }

/**
 * The kind of value an option or a slot prop takes, which renderers read at
 * runtime to tell it from an element's own props and to parse attributes:
 * `"string"`, `"number"`, `"boolean"` and `"list"` (strings, or one string;
 * comma-separated as an attribute) can come from an attribute; `"value"` is any other value, set as a property;
 * `"callback"` is a function the component calls, an event on custom
 * elements; `"action"` is a callback whose return value matters, like a
 * Promise that makes the part pending, so Vue passes it as a prop, not an
 * emit; `"id"` is a string the renderer makes unique when it's left out;
 * `"key"` is a list item's value, of any type, which keys the part by
 * `api.internal.keyOf(value)`, and which the parts inside it take as that key.
 */
type PropKind =
  | "string"
  | "number"
  | "boolean"
  | "list"
  | "value"
  | "callback"
  | "action"
  | "id"
  | "key"

/**
 * An option or slot prop's kind. With `from`, a part nested in a part of that
 * slot takes the prop from it when it's left out: `"item"` takes the prop of
 * the same name, like an accordion trigger's `value` from its item, and
 * `"group.id"` names the parent's prop, like an option's `group` from its
 * group's `id`. With `required`, a part left outside that slot throws, like
 * an item's check outside an item. A function reads the prop from a custom
 * element's attribute, for values no kind fits, like `modal`, a boolean or a string.
 * @stable
 */
type PropSpec =
  | PropKind
  | { kind: PropKind; from: string; required?: boolean }
  | ((attribute: string | null) => unknown)

/**
 * Every option or prop of `Props`, by name, with its kind. A slot's `id` needs
 * an entry when the part reads it, `"string"`, or when the adapter should make
 * one, `"id"`.
 * @stable
 */
type PropSchema<Props> = {
  [Key in Exclude<keyof Props, "id"> & string]: PropSpec
} & { id?: PropSpec }

/**
 * The options every primitive takes, beside its own. `definePrimitive` adds
 * them to its schema, so a component's options include this type and its
 * schema leaves them out.
 * @stable
 */
type PrimitiveOptions = {
  /** Logs every state change with its reason to the console, in development builds. */
  debug?: boolean
}

/** What adapters read about a primitive at runtime: its options and each slot's props, with their kinds. */
type PrimitiveSchema = {
  options: Record<string, PropSpec>
  slots: Record<string, Record<string, PropSpec>>
}

// The DOM events a slot's `on` handlers take.
type EventMap = HTMLElementEventMap

/** What a slot's `press` and `on` handlers receive. */
type SlotContext<State extends object, Api, Props> = {
  /** The bound element. Undefined before it binds, like for a press a test sends through `press`. */
  el: HTMLElement | undefined
  /** The instance's id. Build part ids from it, like `${id}-content`. */
  id: string
  /** The part's key: its `id` prop, else its `value`. Tells parts of one slot apart. */
  key: string
  /** The props of the part's newest render. */
  props: Props
  /** The instance's store. */
  store: Store<State>
  /** What `api` returned. Call it rather than writing state here. */
  api: Api
}

/**
 * One rendered element of a slot, like one item among many. Adapters get one
 * from `instance.part(slot, props)`, and slots receive it in `bind` and
 * `connect`.
 * @stable
 */
type Part<State extends object = any, Api = any, Props = any> = {
  /** The slot's name. */
  readonly slot: string
  /** `props.id ?? String(props.value)`, which tells parts of one slot apart. */
  readonly key: string
  /** The instance's id. */
  readonly id: string
  /** The instance's api. */
  readonly api: Api
  /** The instance's store. */
  readonly store: Store<State>
  /** The props of the part's newest render. */
  props: Props
  /** The bound element. Undefined until it binds. */
  el: HTMLElement | undefined
}

type SlotFields<State extends object, Api, Props, Public> = {
  /**
   * Whether the slot's element should exist. Adapters that cannot unmount
   * markup, like custom elements, bind and unbind on it. Defaults to always.
   * Keyed parts, like one panel among many, decide from their own props.
   * May read live state: adapters check presence on every change.
   */
  present?: (
    state: State,
    context: { id: string; key: string; props: Props; api: Api }
  ) => boolean
  /** Pure. Runs on the server and on every render. Never reads live state. */
  attrs?: (
    state: State,
    context: { id: string; key: string; props: Props; api: Api }
  ) => Attrs
  /**
   * What `render` functions and state-based class names see, like
   * { highlighted, disabled }. May read live state: adapters only re-render a
   * part for live changes when its render function actually read them.
   */
  state?: (
    state: State,
    context: { id: string; key: string; props: Props; api: Api }
  ) => Public
  /** Attributes written straight to the element on every change, built by `live()`. */
  live?: Live<State, Api, Props>
  /** Attributes of `attrs` core keeps current on a framework's element, built by `direct()`. */
  direct?: Direct
  /** Narrows which changes reach the slot's parts, built by `selects()`. */
  selects?: Selects<State, Api, Props>
  /**
   * Activation: a click, which keys and screen readers send too. `{ none: "why" }`
   * for a role that activates when another handler does it, like the author's own click.
   */
  press?:
    | ((context: SlotContext<State, Api, Props>, event?: Event) => void)
    | Unneeded
  /**
   * DOM events. Adapters attach these so user handlers run first and can
   * call preventDefault() to skip them.
   */
  on?: {
    [Type in keyof EventMap]?: (
      event: EventMap[Type],
      context: SlotContext<State, Api, Props>
    ) => void
  }
  /**
   * Client only, web only. Focus, positioning, observers. Gets the part, whose
   * `props` are its newest render's. Return a cleanup. Follow state with
   * `part.store.subscribe`, or write attributes that change often with `direct`.
   */
  bind?: (el: HTMLElement, part: Part<State, Api, Props>) => (() => void) | void
  /**
   * Client only, web only. Like `bind`, but runs at once while the instance
   * is asleep, for what a part can't wait for, like naming its trigger. Its
   * `part.api` is undefined until the instance wakes.
   * @experimental
   */
  asleep?: (
    el: HTMLElement,
    part: Part<State, Api, Props>
  ) => (() => void) | void
  /**
   * Client only. Runs while the element is in the page, present or not, for
   * adapters that keep parts that aren't present, like custom elements. A
   * popup's content registers here, so shortcuts inside a closed one don't run.
   */
  connect?: (el: HTMLElement) => () => void
}

/**
 * One part of a primitive, like a trigger or an item: how its element
 * renders, reacts and binds. Build slots with the `slot` helper `slots`
 * receives. Every field is optional.
 * @stable
 */
type SlotDefinition<State extends object, Api, Props, Public = {}> = SlotFields<
  State,
  Api,
  Props,
  Public
> &
  SlotSchema<Props>

type Keys<State> =
  readonly HandledKey[] | ((state: State) => readonly HandledKey[])

// What a role asks of its slot and which ARIA it takes: whether it takes
// focus, activates, moves with keys or can't be named, its role-specific
// attributes and its required states. Roles alike share one member.
type ProfileOf<R> = [
  R extends FocusableRole ? 1 : 0,
  R extends PressableRole ? 1 : 0,
  R extends KeyedRole ? 1 : 0,
  R extends NamelessRole ? 1 : 0,
  AriaOf<R>,
  RequiredAria<R>,
]

type Profile = [0 | 1, 0 | 1, 0 | 1, 0 | 1, RoleAria, RoleAria]

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

type RolesLike<P extends Profile> = {
  [R in Role]: Same<ProfileOf<R>, P> extends true ? R : never
}[Role]

// One required field per need, so the error names a missing one. Presence
// only: the definition types each field, so one is built per profile. Listed
// keys ask for an `on.keydown`, last so a list without one is told so.
type Needs<P extends Profile> = (P[0] extends 1 ? { focus: {} } : unknown) &
  (P[1] extends 1 ? { press: {} } : unknown) &
  (P[2] extends 1
    ? { keys: Unneeded } | { keys: {}; on: { keydown: {} } }
    : unknown)

/**
 * A slot's role and what the role asks of it. Core reads these from the
 * definition `slot` gets, and checks them in development builds.
 */
type RoleFields<State extends object, Api, Props> = {
  /**
   * The part's WAI-ARIA role, which core writes. A role that takes focus,
   * activates or moves with keys makes the slot say how, with `focus`,
   * `press` and `keys`. A function picks the role
   * from state, with every role it can pick in `roles`. Never put `role` in `attrs`.
   */
  role?:
    | Role
    | ((
        state: State,
        context: { id: string; key: string; props: Props; api: Api }
      ) => Role | undefined)
  /** Every role a `role` function can pick. Development builds check what each one needs. */
  roles?: readonly Role[]
  /**
   * How the part gets focus, for a role that takes it, like an option or a
   * tab. `{ none: "why" }` when another element takes it instead.
   */
  focus?:
    | Focus
    | Unneeded
    | ((
        state: State,
        context: { id: string; key: string; props: Props; api: Api }
      ) => Focus | Unneeded)
  /**
   * The keys the part's `on.keydown` handles, for a role whose pattern moves
   * with keys, or a function of state when they depend on it, like the arrows
   * of an orientation. `{ none: "why" }` when another element handles them,
   * like a combobox's input for its listbox.
   */
  keys?: Keys<State> | Unneeded
}

// An attribute the role doesn't take, typed as the sentence that says so, so
// the error names it: "aria-orientation isn't allowed on a group". Roles that
// share a member are "this role"; the error shows which one.
type NotAllowed<
  K extends string,
  P extends Profile,
> = `${K} isn't allowed on ${Label<RolesLike<P>>}`

type Label<R extends string> = [R] extends [UnionToIntersection<R>]
  ? `${R extends `${"a" | "e" | "i" | "o" | "u"}${string}` ? "an" : "a"} ${R}`
  : "this role"

type UnionToIntersection<U> = (
  U extends unknown ? (union: U) => void : never
) extends (union: infer I) => void
  ? I
  : never

type RoleAttrs<P extends Profile> = Attrs & {
  [
    K in
      | Exclude<RoleAria, P[4]>
      | (P[3] extends 1 ? "aria-label" | "aria-labelledby" : never)
  ]?: NotAllowed<K, P>
}

// A role's required states are keys its `attrs` always returns, so leaving
// one out is a build error. One that `live` keeps current is `undefined` here.
// One field, not a union, so the error names the missing state.
type AttrsFor<P extends Profile, State extends object, Api, Props> = [
  P[5],
] extends [never]
  ? {
      attrs?: (
        state: State,
        context: { id: string; key: string; props: Props; api: Api }
      ) => RoleAttrs<P>
    }
  : {
      attrs: (
        state: State,
        context: { id: string; key: string; props: Props; api: Api }
      ) => RoleAttrs<P> & { [K in P[5]]: string | undefined }
    }

// One member per profile: TypeScript reuses an alias's instantiation for the
// same arguments, so roles alike collapse into one, which keeps checking cheap.
type RoleMember<P extends Profile, State extends object, Api, Props> = {
  role: RolesLike<P>
} & Needs<P> &
  AttrsFor<P, State, Api, Props>

// Without a literal role, the role's attributes aren't known here, so development builds check them.
type UnroledAttrs<State extends object, Api, Props> = {
  attrs?: (
    state: State,
    context: { id: string; key: string; props: Props; api: Api }
  ) => Attrs
}

// The role's literal picks the member, so TypeScript asks for exactly what that role needs.
type RoleDeclaration<State extends object, Api, Props> = Omit<
  RoleFields<State, Api, Props>,
  "role" | "roles"
> &
  (
    | ({ role?: undefined } & UnroledAttrs<State, Api, Props>)
    | ({
        role: (
          state: State,
          context: { id: string; key: string; props: Props; api: Api }
        ) => Role | undefined
        roles: readonly Role[]
      } & UnroledAttrs<State, Api, Props>)
    | { [R in Role]: RoleMember<ProfileOf<R>, State, Api, Props> }[Role]
  )

/**
 * Each prop the slot takes, with its kind, for renderers to read. TypeScript
 * checks it names them all, and requires it when the slot takes any. A slot
 * typed `any`, like `AnySlot`, never requires it.
 */
type SlotSchema<Props> = 0 extends 1 & Props
  ? Partial<PropsSchema<Props>>
  : [Exclude<keyof Props, "id">] extends [never]
    ? Partial<PropsSchema<Props>>
    : PropsSchema<Props>

type PropsSchema<Props> = {
  /** Each prop the slot's parts take, with its kind, like `{ value: "string" }`. */
  props: PropSchema<Props>
}

type AnySlot = SlotDefinition<any, any, any, any>

/**
 * The `slot` helper `definePrimitive` hands its `slots` function, for slots
 * defined in a module of their own. A slot's props and state come from its
 * definition alone, never from where it's returned, so one that names
 * neither takes no props and has empty state instead of `any`.
 * @stable
 */
type SlotFactory<State extends object, Api> = <
  Props extends object = {},
  Public extends object = {},
>(
  // `attrs` comes from the role's member alone, typed for that role: one
  // signature, so its parameters keep their types.
  definition: Omit<
    SlotFields<State, Api, Props & BaseSlotProps, Public>,
    "attrs"
  > &
    SlotSchema<Props & BaseSlotProps> &
    RoleDeclaration<State, Api, Props & BaseSlotProps>
) => SlotDefinition<State, Api, NoInfer<Props> & BaseSlotProps, NoInfer<Public>>

/**
 * The props a slot's parts take, which an instance's `part` reads. Emitted
 * declarations name it in every instance's `part` signature.
 * @stable
 */
type SlotProps<Slot> =
  Slot extends SlotDefinition<any, any, infer Props, any> ? Props : never
type SlotState<Slot> =
  Slot extends SlotDefinition<any, any, any, infer Public> ? Public : never

// The reasons `on<Key>Change`, or `on<Key>Commit` with `Kind` "Commit", lists.
type ReasonFor<
  Options,
  Key extends string,
  Kind extends string = "Change",
> = Options extends {
  [Callback in `on${Capitalize<Key>}${Kind}`]?: (
    value: never,
    details: infer Details extends { reason: string }
  ) => unknown
}
  ? Details["reason"]
  : string

/**
 * What `api` receives. Everything else a primitive needs is an import from
 * `@ui-sdk/core`, so it pays only for what it uses: `createChange` for
 * `on<Key>Change`, `elements` for bound parts in document order. A
 * `controller` option drives whatever `api` returns.
 * @stable
 */
type PrimitiveContext<Options, State extends object, Slot extends string> = {
  /** The instance's id, unique on the page. Build part ids from it. */
  id: string
  /** What warnings, `debug` and the devtools call the component. */
  label: string
  /** The instance's state: `get()`, `set(partial)` and `subscribe(listener)`. */
  store: Store<State>
  /** The newest options. Read them when you need them, not once in `api`. */
  options: () => Options
  /**
   * Runs after the adapter passes new options, before `sync` writes them. May
   * return the source that write reports, like the change that asked for it.
   */
  onOptions: (
    listener: (
      options: Options,
      synced: Partial<State> | undefined
    ) => ChangeSource | void
  ) => void
  /**
   * Runs when the instance leaves the page, from `destroy()`, once. A popup
   * settles a pending controller `open()` here. Work that reaches outside the
   * instance starts through `whenKept` instead, which stops it.
   */
  onDestroy: (cleanup: () => void) => void
  /** Every part rendered so far. `elements(context, slot)` reads the bound ones in document order. */
  parts(): Iterable<Part>
  /** A bound element of `slot` in the page: the part with `key`, or the first bound one. Undefined on the server. */
  element(slot: Slot, key?: string): HTMLElement | undefined
  /**
   * The props the part of `slot` with `key` last rendered with. `key` defaults to `""`, a part with no `id` or `value`.
   * Name the slot's props to type them: `props<{ disabled?: boolean }>("item", key)`.
   */
  props<Props extends object = object>(
    slot: Slot,
    key?: string
  ): Props | undefined
}

/**
 * Parts a component ships only once a page renders them, like a select's
 * select-all option. A feature carries its slots and an `extend` that runs once
 * per instance, the first time a part registers it with `use`, and fills in
 * the hooks the component's `api` calls. Define one as a top-level constant
 * marked `/* @__PURE__ *\/`, so a page that never imports it drops it.
 * Our components use it, through `@ui-sdk/core/renderer`; a primitive's type
 * names it, so declarations that print one need it.
 * @experimental
 */
type Feature<
  Api = any,
  Slots extends Record<string, AnySlot> = Record<string, AnySlot>,
> = {
  /** The slots it adds, defined like the ones in `definePrimitive`'s `slots`. */
  slots: Slots
  /** Runs once per instance, the first time a part uses the feature. Fills in hooks the component's api calls. */
  extend?: (api: Api) => void
}

/**
 * A primitive whose types also list its features' slots, which the parts
 * that render them register. Type-only: features stay out of the bundle
 * until a part imports them. Internal, like `Feature`.
 */
type WithFeatures<
  P extends (options: any) => {
    types: { slots: object }
    part: (...args: any) => any
  },
  Features,
> = ((options: Parameters<P>[0]) => Omit<ReturnType<P>, "types" | "part"> & {
  types: Omit<ReturnType<P>["types"], "slots"> & {
    slots: AllSlots<P, Features>
  }
  part: <S extends keyof AllSlots<P, Features> & string>(
    slot: S,
    props?: SlotProps<AllSlots<P, Features>[S]>
  ) => ReturnType<ReturnType<P>["part"]>
}) & { options?: Record<string, PropSpec> | undefined; slots?: object }

type AllSlots<
  P extends (options: any) => { types: { slots: object } },
  Features,
> = ReturnType<P>["types"]["slots"] & FeatureSlots<Features>

type FeatureSlots<Features> = (
  Features extends Feature<any, infer Slots> ? (slots: Slots) => void : never
) extends (slots: infer All) => void
  ? All
  : never

/**
 * How a generic primitive's types depend on its type parameters, so renderers
 * make its parts generic, like a `Tabs` whose `value` is `T`. `this["T"]` and
 * `this["U"]` are the parameters, `T` and `U` their constraints, and
 * `defaults` what they are when nothing infers them. `options` are the
 * options, and `state` and `props` each slot's state and props that depend on
 * them. Attach it with `as WithGeneric<typeof primitive, Generic>`.
 *
 * @example
 * interface TabsGeneric extends PrimitiveGeneric {
 *   T: string
 *   options: TabsOptions<this["T"] & string>
 *   state: TabsStates<this["T"] & string>
 * }
 * type TabsStates<T extends string> = { root: TabsState<T> }
 */
interface PrimitiveGeneric {
  T: unknown
  U: unknown
  defaults?: { T?: unknown; U?: unknown }
  options: object
  state?: Record<string, object>
  props?: Record<string, object>
}

/**
 * A primitive with the generic types renderers make its parts from. Type-only and internal.
 */
type WithGeneric<P extends Primitive, G extends PrimitiveGeneric> = P & {
  generic?: G
}

/**
 * A type as it is, for an interface to extend, which gives a primitive's type
 * a name: `interface TabsPrimitive extends Named<typeof tabsPrimitive> {}`.
 * Emitted declarations name an interface where they would print a primitive's
 * whole type, its slots and api, at every use.
 * @stable
 */
type Named<T> = T

// A primitive with options of its own names each with its kind; one without needs no schema.
type OptionsSchema<Options, Own = Omit<Options, keyof PrimitiveOptions>> = [
  keyof Own,
] extends [never]
  ? {
      /** Each option, with its kind, for renderers to read. A primitive without options leaves it out. */
      options?: PropSchema<Own>
    }
  : {
      /**
       * Each option, with its kind, for renderers to read, like `{ open: "boolean",
       * onOpenChange: "callback" }`. TypeScript checks it names them all.
       */
      options: PropSchema<Own>
    }

type ControlledBy<Options> = NonNullable<
  (Options & { controller?: unknown })["controller"]
>

// What a primitive's `agent` key declares, as the agent bridge reads it.
type AgentSurface = {
  actions?: string[]
  closed?: boolean
  items?: (api: any) => unknown
  reveals?: boolean
  shown?: (state: any) => boolean
  secret?: boolean
}

/**
 * What every adapter works against. Adapters never import a specific primitive.
 * @stable
 */
type Primitive = ((options: any) => PrimitiveInstance) & {
  options?: Record<string, PropSpec> | undefined
  slots?: object
}

/**
 * What `definePrimitive` returns an instance of. Adapters create and drive it; components rarely touch it.
 * @stable
 */
type PrimitiveInstance = {
  types: {
    options: object
    state: object
    api: unknown
    slots: Record<string, AnySlot>
  }
  name: string
  id: string
  get: () => object
  subscribe: (listener: () => void) => () => void
  api: unknown
  part: (slot: any, props?: any, rendering?: boolean) => Part
  /** @internal Switches on a feature, for the parts our components ship. */
  use: (feature: Feature) => void
  preview: (options: any) => object | undefined
  /**
   * Runs `read` with the instance's state reading as `state`, like a preview a
   * framework renders, and the parts in `around`, by slot, reading as those props.
   */
  view<T>(state: object, read: () => T, around?: Record<string, object>): T
  setOptions: (options: any) => void
  /** @internal The state these options would start a new instance at. */
  startState: (options: any) => object
  follow: (
    current: () => any
  ) => (state?: any, before?: any) => Record<string, unknown> | undefined
  destroy: () => void
}

/**
 * Types adapters derive from a primitive.
 * @stable
 */
type TypesOf<P extends Primitive> = ReturnType<P>["types"]
/**
 * A primitive's slot names.
 * @stable
 */
type SlotName<P extends Primitive> = keyof TypesOf<P>["slots"] & string
/**
 * The props a primitive's slot takes.
 * @stable
 */
type PropsOf<P extends Primitive, S extends SlotName<P>> = SlotProps<
  TypesOf<P>["slots"][S]
>
/**
 * The options a primitive takes, without `id`, which adapters supply.
 * @stable
 */
type OptionsOf<P extends Primitive> = Omit<TypesOf<P>["options"], "id">
/**
 * The state a primitive's slot hands render functions, from its `state`.
 * @stable
 */
type StateOf<P extends Primitive, S extends SlotName<P>> = SlotState<
  TypesOf<P>["slots"][S]
>

export {
  type AgentSurface,
  type AnySlot,
  type Attrs,
  type BaseSlotProps,
  type ControlledBy,
  type EventMap,
  type Feature,
  type Named,
  type OptionsOf,
  type OptionsSchema,
  type Part,
  type Primitive,
  type PrimitiveContext,
  type PrimitiveGeneric,
  type PrimitiveInstance,
  type PrimitiveOptions,
  type PrimitiveSchema,
  type PropSchema,
  type PropSpec,
  type PropsOf,
  type ReasonFor,
  type RoleFields,
  type SlotDefinition,
  type SlotFactory,
  type SlotName,
  type SlotProps,
  type StateOf,
  type TypesOf,
  type WithFeatures,
  type WithGeneric,
}
