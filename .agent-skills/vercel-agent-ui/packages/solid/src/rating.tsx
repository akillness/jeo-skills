import {
  rating,
  ratingItemValues,
  type RatingItemState,
  type RatingOptions,
  type RatingState,
} from "@ui-sdk/core/rating"
import type { JSX } from "@solidjs/web"
import { createContext, For, merge, omit, useContext } from "solid-js"
import { joinField, useFieldControl } from "./field-context"
import { createParts, usePart, type PartProps } from "./use-primitive"

const parts = createParts(rating, {})

const ItemContext = createContext<{ index: number; step: () => number } | null>(
  null
)

/**
 * A score picked from a row of stars, a radio per star or half star, with a
 * preview while a pointer moves over them. Its children render once per star.
 * @experimental
 */
function Rating(
  props: RatingOptions &
    Omit<
      PartProps<"div", RatingState>,
      "onChange" | "onSelect" | "children"
    > & { children?: JSX.Element }
) {
  const field = useFieldControl()
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "max",
    "step",
    "deselectable",
    "disabled",
    "readOnly",
    "required",
    "name",
    "form",
    "loop",
    "getValueLabel",
    "controller",
    "debug",
    "children"
  )
  const stars = () => Array.from({ length: props.max ?? 5 }, (_, at) => at + 1)
  const step = () => props.step ?? 1
  const root = merge(joinField(field, rest, "div"), {
    children: () => (
      <For each={stars()}>
        {(index) => (
          <ItemContext value={{ index, step }}>
            {props.children ?? <RatingItem />}
          </ItemContext>
        )}
      </For>
    ),
  })
  return (
    <parts.Root
      {...props}
      disabled={props.disabled || field?.disabled()}
      name={props.name ?? field?.name()}
    >
      {usePart(rating, "root", undefined, root, "div")}
    </parts.Root>
  )
}

function RatingRadio(props: { value: string }) {
  const radio = () => ({ value: props.value })
  return (
    <>
      {usePart(rating, "radio", radio, {}, "button")}
      {usePart(rating, "input", radio, {}, "input")}
    </>
  )
}

/**
 * One star. Put its icon inside: the state says how full it is, and the
 * radios that pick its score sit over it.
 * @experimental
 */
function RatingItem(props: PartProps<"span", RatingItemState>) {
  const item = useContext(ItemContext)
  if (!item) {
    throw new Error("RatingItem must be used inside <Rating>.")
  }
  const rest = omit(props, "children")
  const radios = (
    <For each={ratingItemValues(item.index, item.step())}>
      {(score) => <RatingRadio value={String(score)} />}
    </For>
  )
  const content = (state: RatingItemState) =>
    [
      typeof props.children === "function" && props.children.length > 0
        ? props.children(state)
        : props.children,
      radios,
    ] as JSX.Element
  return usePart(
    rating,
    "item",
    () => ({ index: item.index }),
    merge(rest, { children: content }),
    "span"
  )
}

export { createRatingController } from "@ui-sdk/core/rating"
export type {
  RatingApi,
  RatingChangeOptions,
  RatingController,
  RatingItemProps,
  RatingItemState,
  RatingOptions,
  RatingPrimitive,
  RatingState,
  RatingValueChangeReason,
} from "@ui-sdk/core/rating"

export { Rating, RatingItem }
