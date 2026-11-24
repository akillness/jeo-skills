import { schemaOf, type PrimitiveGeneric } from "@ui-sdk/core/renderer"
import type {
  OptionsOf,
  Primitive,
  PropsOf,
  SlotName,
  StateOf,
  TypesOf,
} from "@ui-sdk/core"
import type {
  Component,
  ComponentConstructorOptions,
  Snippet,
  SvelteComponent,
} from "svelte"
import type { SvelteHTMLElements } from "svelte/elements"
import SchemaPart from "./create-parts/schema-part.svelte"
import type { PartProps } from "./use-primitive.svelte"

type Tag = keyof SvelteHTMLElements & string

// "tab-icon" is "TabIcon".
const pascal = (name: string) =>
  name.replace(/(^|-)(\w)/g, (_, _dash, char: string) => char.toUpperCase())

// "tab-icon" is `TabIcon`.
type Pascal<Name extends string> = Name extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${Pascal<Tail>}`
  : Capitalize<Name>

// A part's element props, without the ones its slot or options name. Built
// from the element's attributes, since `Omit` on `PartProps`, which takes any
// attribute, would drop every named one.
type ElementProps<T extends Tag, State, Named> = Omit<
  SvelteHTMLElements[T],
  "children" | keyof Named
> &
  Pick<PartProps<T, State>, "render" | "children"> & {
    [attribute: string]: unknown
  }

// A part's props: what its slot and, for a root, the options name, and its element's.
type Props<Named, State, T extends Tag> = Named & ElementProps<T, State, Named>

type RootSlot<P extends Primitive> = "root" & SlotName<P>

// A root's props: the options, the root slot's props and its element's, or
// the options and children without a root tag.
type RootProps<
  P extends Primitive,
  Options,
  State,
  T extends Tag | undefined,
> = T extends Tag
  ? Props<Options & PropsOf<P, RootSlot<P>>, State, T>
  : Options & { children?: Snippet }

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
// A generic root's props for parameters `A` and `B`. Indexed, not matched
// with a conditional, so TypeScript infers the parameters from the props.
type GenericRootProps<
  P extends Primitive,
  G extends PrimitiveGeneric,
  A,
  B,
  T extends Tag | undefined,
> = RootProps<
  P,
  Applied<G, A, B>["options"],
  StateIn<P, RootSlot<P>, Applied<G, A, B>>,
  T
>
// A generic part's props for parameter `A`.
type GenericPartProps<
  P extends Primitive,
  S extends SlotName<P>,
  G extends PrimitiveGeneric,
  A,
  T extends Tag,
> = Props<
  (Applied<G, A, unknown>["props"] & Record<S, unknown>)[S],
  StateIn<P, S, Applied<G, A, unknown>>,
  T
>

// Generic components are typed the way Svelte types a component with
// `generics`, a constructor and a function, so the compiler infers their
// parameters from the props.
interface GenericRoot<
  P extends Primitive,
  G extends PrimitiveGeneric,
  T extends Tag | undefined,
> {
  new <
    A extends G["T"] = DefaultOf<G, "T">,
    B extends G["U"] = DefaultOf<G, "U">,
  >(
    options: ComponentConstructorOptions<GenericRootProps<P, G, A, B, T>>
  ): SvelteComponent<GenericRootProps<P, G, A, B, T>>
  <A extends G["T"] = DefaultOf<G, "T">, B extends G["U"] = DefaultOf<G, "U">>(
    internals: unknown,
    props: GenericRootProps<P, G, A, B, T>
  ): {}
}

interface GenericPart<
  P extends Primitive,
  S extends SlotName<P>,
  G extends PrimitiveGeneric,
  T extends Tag,
> {
  new <A extends G["T"] = DefaultOf<G, "T">>(
    options: ComponentConstructorOptions<GenericPartProps<P, S, G, A, T>>
  ): SvelteComponent<GenericPartProps<P, S, G, A, T>>
  <A extends G["T"] = DefaultOf<G, "T">>(
    internals: unknown,
    props: GenericPartProps<P, S, G, A, T>
  ): {}
}

// The root's component: generic over the primitive's parameters when it has them.
type RootOf<P extends Primitive, T extends Tag | undefined> = [
  GenericOf<P>,
] extends [never]
  ? Component<RootProps<P, OptionsOf<P>, StateOf<P, RootSlot<P>>, T>>
  : GenericRoot<P, GenericOf<P>, T>

// A part's component: generic when the primitive's parameters reach its props.
type PartOf<P extends Primitive, S extends SlotName<P>, T extends Tag> = [
  GenericOf<P>,
] extends [never]
  ? Component<Props<PropsOf<P, S>, StateOf<P, S>, T>>
  : GenericOf<P> extends { props: Record<S, unknown> }
    ? GenericPart<P, S, GenericOf<P>, T>
    : Component<Props<PropsOf<P, S>, StateIn<P, S, GenericOf<P>>, T>>

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
 * `Root` renders only its children. Every part takes the `render`
 * snippet and `children`, which receives its state. An option with an
 * `on<Key>Change` callback can be bound, like `bind:value`.
 *
 * @example
 * const { Root: Playlist, Track: PlaylistTrack } = createParts(playlist, { root: "ul", track: "li" })
 * @stable
 */
function createParts<
  P extends Primitive,
  const Tags extends { [S in SlotName<P>]?: Tag },
>(primitive: P, tags: Tags) {
  const schema = schemaOf(primitive)
  // The slots whose props a nested part takes, which provide them to it.
  const providers = Object.values(schema.slots).flatMap((props) =>
    Object.values(props).map(
      (spec) => typeof spec === "object" && spec.from.split(".")[0]
    )
  )
  const parts: Record<string, Component<Record<string, any>>> = {}
  for (const slot of new Set(["root", ...Object.keys(tags)])) {
    const tag = (tags as Record<string, Tag>)[slot]
    const config = {
      primitive,
      schema,
      slot,
      tag,
      provides: providers.includes(slot),
    }
    // Svelte 5 calls a component as a function of its internals and its
    // props, on the server and the client alike, so a function that hands
    // both on, the props untouched, renders the generic part bound to one
    // slot: no markup and no effect of its own, so server rendering and
    // hydration see the generic part as if the app had rendered it.
    parts[pascal(slot)] = (internals, props) =>
      SchemaPart(internals, { config, props })
  }
  return parts as unknown as Parts<P, Tags>
}

export { createParts, type Parts }
