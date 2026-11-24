// A slot's props are typed only when api code names them, so a misread field
// is a compile error rather than a silent `any`. `pnpm typecheck` checks this file.
import { expect, expectTypeOf, test } from "vitest"
import { elements } from "../src/foundation/kernel/elements"
import type { PrimitiveContext } from "../src/foundation/kernel/primitive-types"

type ItemProps = { value: string; disabled?: boolean }

function reads(context: PrimitiveContext<object, object, "item">) {
  // @ts-expect-error A slot's props are an object until they're named.
  void context.props("item", "a")?.disabled
  // @ts-expect-error The same for the parts `elements` finds.
  void elements(context, "item")[0]?.props.disabled
  // @ts-expect-error A named slot's props reject a field they don't have.
  void context.props<ItemProps>("item", "a")?.disabeld
  // @ts-expect-error The same for `elements`.
  void elements<ItemProps>(context, "item")[0]?.props.disabeld
  expectTypeOf(context.props<ItemProps>("item", "a")).toEqualTypeOf<
    ItemProps | undefined
  >()
  expectTypeOf(context.props("item", "a")).toEqualTypeOf<object | undefined>()
  expectTypeOf(
    elements<ItemProps>(context, "item")[0]!.props
  ).toEqualTypeOf<ItemProps>()
}

test("part props are typed only when named", () => {
  expect(typeof reads).toBe("function")
})
