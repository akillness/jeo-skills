// `createParts`: every part of a primitive as a Vue component, with runtime
// props and events read from the primitive's schema.
import type {
  OptionsOf,
  Primitive,
  PropSpec,
  PropsOf,
  SlotName,
  StateOf,
  TypesOf,
} from "@ui-sdk/core"
import { schemaOf, type PrimitiveGeneric } from "@ui-sdk/core/renderer"
import {
  defineComponent,
  useId,
  type DefineSetupFnComponent,
  type EmitsToProps,
  type HTMLAttributes,
  type IntrinsicElementAttributes,
  type PublicProps,
  type SlotsType,
  type VNode,
} from "vue"
import {
  optionalBoolean,
  type StateSlots,
  pascal,
  provideProps,
  usePart,
  usePrimitive,
  useScope,
} from "./use-primitive"
import { warnAttributes } from "./renderless"

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

// A list's api, whose items' values key their parts.
type ListApi = { internal: { keyOf: (value: unknown) => string } }

// Vue's runtime prop for each kind but callbacks, which are events. Actions
// are props, so the part gets what they return.
const propTypes = {
  string: String,
  number: Number,
  boolean: optionalBoolean,
  list: [Array, String],
  value: null,
  id: null,
  key: null,
  action: Function,
}

// The runtime props of a part: those the schemas name.
function runtimeProps(...schemas: Record<string, PropSpec>[]) {
  const props: Record<string, unknown> = {}
  for (const schema of schemas) {
    for (const key in schema) {
      const kind = kindOf(schema[key])
      if (kind !== "callback") {
        props[key] = propTypes[kind]
      }
    }
  }
  return props as Record<string, null>
}

// A callback `on<Name>` emits `<name>`, and `on<Key>Change` emits
// `update:<key>` after it when there's a `<key>` prop, so `v-model:<key>` works.
function eventsOf(schema: Record<string, PropSpec>) {
  return Object.keys(schema)
    .filter((key) => kindOf(schema[key]) === "callback")
    .map((key) => {
      const event = key[2].toLowerCase() + key.slice(3)
      const model = event.endsWith("Change")
        ? event.slice(0, -"Change".length)
        : ""
      return {
        key,
        event,
        update: model in schema ? `update:${model}` : undefined,
      }
    })
}

// The key `v-model` binds without an argument: a component's main value.
const models = ["value", "checked", "pressed", "open", "page", "layout"]
const modelOf = (events: ReturnType<typeof eventsOf>) =>
  models.find((key) => events.some(({ update }) => update === `update:${key}`))

const emitsOf = (events: ReturnType<typeof eventsOf>) =>
  events.flatMap(({ event, update }) => (update ? [event, update] : [event]))

// A callback per event that emits it. The change event runs first, so
// canceling it also keeps v-model as it was.
function emitters(
  events: ReturnType<typeof eventsOf>,
  emit: (event: string, ...args: unknown[]) => void
) {
  const callbacks: Record<string, (...args: unknown[]) => void> = {}
  for (const { key, event, update } of events) {
    callbacks[key] = (...args) => {
      emit(event, ...args)
      if (
        update &&
        !(args[1] as { canceled?: boolean } | undefined)?.canceled
      ) {
        emit(update, args[0])
      }
    }
  }
  return callbacks
}

// "tab-icon" is `TabIcon`.
type Pascal<Name extends string> = Name extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${Pascal<Tail>}`
  : Capitalize<Name>

// The props that are callbacks, which become events.
type CallbackKeys<Props> = {
  [Key in keyof Props & `on${string}`]-?: NonNullable<Props[Key]> extends (
    ...args: never[]
  ) => unknown
    ? Key
    : never
}[keyof Props & `on${string}`]
type CallbackArgs<Props, Key extends keyof Props> = Parameters<
  Extract<NonNullable<Props[Key]>, (...args: never[]) => unknown>
>

/**
 * A part's events: `<name>` for each `on<Name>` prop, and `update:<key>` for
 * each `on<Key>Change` when there's a `<key>` prop, for `v-model:<key>`.
 */
type Emits<Props> = {
  [
    Key in CallbackKeys<Props> as Key extends `on${infer Name}`
      ? Uncapitalize<Name>
      : never
  ]: (...args: CallbackArgs<Props, Key>) => true
} & {
  [
    Key in CallbackKeys<Props> as Key extends `on${infer Model}Change`
      ? Uncapitalize<Model> extends keyof Props
        ? `update:${Uncapitalize<Model>}`
        : never
      : never
  ]: (value: CallbackArgs<Props, Key>[0]) => true
}

// The key plain `v-model` binds: the first of these with a change callback.
type ModelKey<
  Props,
  Keys = ["value", "checked", "pressed", "open", "page", "layout"],
> = Keys extends [infer Key extends string, ...infer Rest]
  ? Key extends keyof Props
    ? `on${Capitalize<Key>}Change` extends CallbackKeys<Props>
      ? Key
      : ModelKey<Props, Rest>
    : ModelKey<Props, Rest>
  : never
// `modelValue` and its update event, for plain `v-model` on the main value.
type Model<Props> = [ModelKey<Props>] extends [never]
  ? {}
  : { modelValue?: Props[ModelKey<Props> & keyof Props] }
type ModelEmits<Props> = [ModelKey<Props>] extends [never]
  ? {}
  : {
      "update:modelValue": (
        value: CallbackArgs<
          Props,
          `on${Capitalize<ModelKey<Props>>}Change` & CallbackKeys<Props>
        >[0]
      ) => true
    }

/**
 * The attributes and events of the element `Tag`, which fall through to a part
 * that renders it, with `data-*` attributes, which a template hands a
 * component in camel case.
 */
type ElementAttributes<Tag extends string> =
  (Tag extends keyof IntrinsicElementAttributes
    ? IntrinsicElementAttributes[Tag]
    : HTMLAttributes) & { [attribute: `data${Capitalize<string>}`]: unknown }

// The element's attributes a part doesn't take as its own props or events.
type FallthroughOf<Tag extends string, Props> = Omit<
  ElementAttributes<Tag>,
  keyof Props
>

type Component = new (...args: any[]) => { $props: object }

/**
 * A part that also takes the attributes and events of the element `Tag` it
 * renders, under strict templates too. One construct signature, so a template
 * and `InstanceType` both see them.
 */
type ElementPart<Part extends Component, Tag extends string> = Pick<
  Part,
  keyof Part
> &
  ElementConstructor<Part, Tag>

// Named, so declarations name them instead of spelling out Vue's instance
// type, which names Vue's internal packages.
interface ElementConstructor<Part extends Component, Tag extends string> {
  new (...args: any[]): ElementInstance<Part, Tag>
}
type ElementInstance<
  Part extends Component,
  Tag extends string,
> = InstanceType<Part> & {
  $props: FallthroughOf<Tag, InstanceType<Part>["$props"]>
}

/**
 * Types a part written by hand to take the attributes and events of the
 * element it renders, the way `createParts` types its parts.
 */
/* @__NO_SIDE_EFFECTS__ */
function withElement<Tag extends string, Part extends Component>(
  _tag: Tag,
  part: Part
) {
  return part as unknown as ElementPart<Part, Tag>
}

// A part's component: its props but callbacks, which are events, and the
// attributes of the element it renders.
type PartComponent<Props, State, Tag extends string> = ElementPart<
  DefineSetupFnComponent<
    Omit<Props, CallbackKeys<Props>>,
    Emits<Props>,
    StateSlots<State>
  >,
  Tag
>

// A generic component's props: whole, with no `Omit`, so TypeScript infers
// the parameters from them, and a callback types the handler of its event.
// With a tag, the attributes of the element it renders too.
type GenericProps<Props, Tag extends string = never> = Props &
  EmitsToProps<Emits<Props>> &
  PublicProps &
  ([Tag] extends [never] ? {} : FallthroughOf<Tag, Props>)
// A generic root's props, with plain `v-model` too.
type GenericRootProps<Props, Tag extends string = never> = GenericProps<
  Props,
  Tag
> &
  Model<Props> &
  EmitsToProps<ModelEmits<Props>>

/**
 * A hand-written root's component type, for one generic over its value like
 * `createParts`' roots: `new <T>(props: RootPropsOf<Options<T>>) => RootInstanceOf<Options<T>>`.
 * Callbacks are events and plain `v-model` binds the main value. A union of
 * options, like one shape per `multiple`, keeps each shape's own.
 */
type RootPropsOf<Props, Tag extends string = never> = GenericRootProps<
  Props,
  Tag
>
type RootInstanceOf<
  Props,
  State = {},
  Tag extends string = never,
> = InstanceType<RootPart<Props, State, Tag>>
// `h()` reads a component's props from its last construct signature, with the
// value's type left open, which a generic signature can't match. This one,
// which no call can use, gives it the props for any value.
type RenderableWith<Props, State = {}, Tag extends string = never> = new (
  props: never
) => RootInstanceOf<Props, State, Tag>

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
type StateIn<P extends Primitive, S extends SlotName<P>, A> = A extends {
  state: Record<S, infer State>
}
  ? State
  : StateOf<P, S>

// A root's props: the options, and with a `root` tag, its slot's props.
type RootProps<P extends Primitive, Options, Tag extends string> = Options &
  ([Tag] extends [never] ? {} : PropsOf<P, RootSlot<P>>)

// The root's slots: a part's with a `root` tag, or only its content.
type RootSlots<State, HasTag> = HasTag extends true
  ? StateSlots<State>
  : SlotsType<{ default?: () => VNode[] }>

type RootComponent<Props, State, HasTag> = DefineSetupFnComponent<
  Omit<Props, CallbackKeys<Props>> & Model<Props>,
  Emits<Props> & ModelEmits<Props>,
  RootSlots<State, HasTag>
>

// The root's component, with the attributes of the element it renders when it has a tag.
type RootPart<Props, State, Tag extends string> = [Tag] extends [never]
  ? RootComponent<Props, State, false>
  : ElementPart<RootComponent<Props, State, true>, Tag>

// The root's component: generic over the primitive's parameters when it has them.
type RootOf<P extends Primitive, Tag extends string> = [GenericOf<P>] extends [
  never,
]
  ? RootPart<RootProps<P, OptionsOf<P>, Tag>, StateOf<P, RootSlot<P>>, Tag>
  : new <
      A extends GenericOf<P>["T"] = DefaultOf<GenericOf<P>, "T">,
      B extends GenericOf<P>["U"] = DefaultOf<GenericOf<P>, "U">,
    >(
      props: GenericRootProps<
        RootProps<P, Applied<GenericOf<P>, A, B>["options"], Tag>,
        Tag
      >
    ) => RootInstanceOf<
      RootProps<P, Applied<GenericOf<P>, A, B>["options"], Tag>,
      StateIn<P, RootSlot<P>, Applied<GenericOf<P>, A, B>>,
      Tag
    >

// A part's component: generic when the primitive's parameters reach its props.
type PartOf<P extends Primitive, S extends SlotName<P>, Tag extends string> = [
  GenericOf<P>,
] extends [never]
  ? PartComponent<PropsOf<P, S>, StateOf<P, S>, Tag>
  : GenericOf<P> extends { props: Record<S, unknown> }
    ? new <A extends GenericOf<P>["T"] = DefaultOf<GenericOf<P>, "T">>(
        props: GenericProps<GenericPartProps<P, S, A>, Tag>
      ) => InstanceType<
        PartComponent<
          GenericPartProps<P, S, A>,
          StateIn<P, S, Applied<GenericOf<P>, A, unknown>>,
          Tag
        >
      >
    : PartComponent<PropsOf<P, S>, StateIn<P, S, GenericOf<P>>, Tag>
// Indexed, not matched with a conditional, so TypeScript infers the parameters from the props.
type GenericPartProps<P extends Primitive, S extends SlotName<P>, A> = (Applied<
  GenericOf<P>,
  A,
  unknown
>["props"] &
  Record<S, unknown>)[S]

/**
 * The components `createParts` makes: `Root`, and one per tagged slot, named in Pascal case.
 * @stable
 */
type Parts<
  P extends Primitive,
  Tags extends { [S in SlotName<P>]?: string },
> = {
  Root: RootOf<P, Tags extends { root: infer Tag extends string } ? Tag : never>
} & {
  [
    S in keyof TypesOf<P>["slots"] as S extends Exclude<keyof Tags, "root"> &
      string
      ? Pascal<S>
      : never
  ]: PartOf<P, S & SlotName<P>, Tags[S & keyof Tags] & string>
}

/**
 * Every part of a primitive as a component, typed from it. `Root` makes the
 * instance from the primitive's options and shares it with the parts inside
 * it. Each slot named in `tags` becomes a component that renders that tag,
 * named in Pascal case, like `TabIcon` for `tab-icon`. Without a `root` tag,
 * `Root` renders only its default slot. Callbacks are events, and
 * `on<Key>Change` also emits `update:<key>`, so `v-model:<key>` works. Every
 * part takes the attributes and events of its tag and a `render` slot, and its
 * default slot receives its state.
 *
 * @example
 * const { Root: Playlist, Track: PlaylistTrack } = createParts(playlist, { root: "ul", track: "li" })
 * @stable
 */
function createParts<
  P extends Primitive,
  const Tags extends { [S in SlotName<P>]?: string },
>(primitive: P, tags: Tags) {
  const schema = schemaOf(primitive)
  const name = pascal(primitive.name)
  const tagOf = tags as Record<string, string>
  // Slots whose props a nested part takes, which provide them to it.
  const provides = new Set(
    Object.values(schema.slots).flatMap((props) =>
      Object.entries(props).flatMap(
        ([key, spec]) => fromOf(spec, key)?.slot ?? []
      )
    )
  )
  const keyed = new Set(
    Object.entries(schema.slots).flatMap(([slot, props]) =>
      Object.values(props).some((spec) => kindOf(spec) === "key") ? [slot] : []
    )
  )
  const options = Object.keys(schema.options).filter(
    (option) => kindOf(schema.options[option]) !== "callback"
  )
  const rootSchema = tagOf.root ? (schema.slots.root ?? {}) : {}
  const rootEvents = eventsOf({ ...schema.options, ...rootSchema })
  const model = modelOf(rootEvents)

  // A slot's props from the part's own and its callbacks, with `id` props
  // left out made unique and `from` props left out taken from the part around it.
  // A `"key"` prop keys the part by the list's `keyOf`, and a `required` one throws outside its parent.
  function useSlotProps(
    slot: string,
    props: Record<string, unknown>,
    callbacks: Record<string, unknown>,
    model?: string
  ) {
    const scope = useScope(primitive)
    const around = scope?.around ?? {}
    const fields = Object.entries(schema.slots[slot] ?? {})
      .filter(([, spec]) => kindOf(spec) !== "callback")
      .map(([prop, spec]) => {
        const from = fromOf(spec, prop)
        if (
          from &&
          !around[from.slot] &&
          (spec as { required?: boolean }).required
        ) {
          throw new Error(
            `<${name}${pascal(slot)}> must be used inside <${name}${pascal(from.slot)}>.`
          )
        }
        return {
          prop,
          id: kindOf(spec) === "id" ? useId() : undefined,
          from,
          key: kindOf(spec) === "key",
        }
      })
    return () => {
      const result: Record<string, unknown> = { ...callbacks }
      for (const { prop, id, from, key } of fields) {
        let value = props[prop]
        if (value === undefined && prop === model) {
          value = props.modelValue
        }
        if (value === undefined) {
          value = id ?? (from && around[from.slot]?.()[from.prop])
        }
        result[prop] = value
        if (key) {
          result.id = (scope?.handle.api as ListApi).internal.keyOf(value)
        }
      }
      return result
    }
  }

  const Root = defineComponent({
    name,
    inheritAttrs: false,
    props: {
      ...runtimeProps(schema.options, rootSchema),
      ...(model ? { modelValue: null } : {}),
    } as Record<string, null>,
    emits: [...emitsOf(rootEvents), ...(model ? ["update:modelValue"] : [])],
    setup(props, { slots, emit, attrs }) {
      // `v-model` without an argument binds the main value, as `v-model:<key>` would.
      const callbacks = emitters(rootEvents, (event, ...args) => {
        emit(event, ...args)
        if (event === `update:${model}`) {
          emit("update:modelValue", ...args)
        }
      })
      const handle = usePrimitive(primitive, () => {
        const current: Record<string, unknown> = { ...callbacks }
        for (const option of options) {
          current[option] = props[option]
        }
        if (model && current[model] === undefined) {
          current[model] = props.modelValue
        }
        return current as OptionsOf<P>
      })
      // Whether there's a root tag never changes.
      if (!tagOf.root) {
        warnAttributes(name, attrs)
        return () => slots.default?.()
      }
      return usePart(
        handle,
        "root",
        useSlotProps("root", props, callbacks, model) as never,
        undefined,
        tagOf.root
      )
    },
  })

  const parts: Record<string, unknown> = { Root }
  for (const slot in tagOf) {
    if (slot === "root") {
      continue
    }
    const partName = `${name}${pascal(slot)}`
    const slotSchema = schema.slots[slot] ?? {}
    const events = eventsOf(slotSchema)
    parts[pascal(slot)] = defineComponent({
      name: partName,
      inheritAttrs: false,
      props: runtimeProps(slotSchema),
      emits: emitsOf(events),
      setup(props, { emit, attrs }) {
        if (!useScope(primitive)) {
          throw new Error(`<${partName}> must be used inside <${name}>.`)
        }
        const slotProps = useSlotProps(slot, props, emitters(events, emit))
        // The parts inside a keyed item take its key as its value.
        if (provides.has(slot)) {
          provideProps(
            primitive,
            slot,
            keyed.has(slot)
              ? () => ({ ...slotProps(), value: slotProps().id })
              : slotProps
          )
        }
        // An `id` the slot reads, like a toolbar item's key, is the element's own too.
        const user =
          "id" in slotSchema
            ? () => (props.id == null ? attrs : { ...attrs, id: props.id })
            : undefined
        return usePart(primitive, slot, slotProps as never, user, tagOf[slot])
      },
    })
  }
  return parts as unknown as Parts<P, Tags>
}
export {
  createParts,
  type ElementAttributes,
  type ElementConstructor,
  type ElementInstance,
  type ElementPart,
  type Parts,
  type RenderableWith,
  type RootInstanceOf,
  type RootPropsOf,
  withElement,
}
