import {
  rating,
  ratingItemValues,
  type RatingController,
  type RatingItemState,
  type RatingOptions,
  type RatingState,
} from "@ui-sdk/core/rating"
import * as React from "react"
import { controlRender, FieldContext, useJoinField } from "./field-context"
import { usePart, usePrimitive, type PartProps } from "./use-primitive"

const ItemContext = React.createContext<{ index: number; step: number } | null>(
  null
)

/**
 * A score picked from a row of stars, a radio per star or half star, with a
 * preview while a pointer moves over them. Its children render once per star.
 * @experimental
 */
function Rating({
  value,
  defaultValue,
  onValueChange,
  max = 5,
  step = 1,
  deselectable,
  disabled,
  readOnly,
  required,
  name,
  form,
  loop,
  getValueLabel,
  controller,
  debug,
  render,
  children,
  ...props
}: RatingOptions &
  Omit<
    PartProps<"div", RatingState>,
    "defaultValue" | "onChange" | "onSelect" | "children"
  > & {
    children?: React.ReactNode
  }) {
  const field = useJoinField(React.useContext(FieldContext))
  const control = usePrimitive(rating, {
    value,
    defaultValue,
    onValueChange,
    max,
    step,
    deselectable,
    disabled: disabled || field?.disabled,
    readOnly,
    required,
    name: name ?? field?.name,
    form,
    loop,
    getValueLabel,
    controller: controller as RatingController | undefined,
    debug,
  })
  const stars = Array.from({ length: max }, (_, at) => (
    <ItemContext.Provider key={at} value={{ index: at + 1, step }}>
      {children ?? <RatingItem />}
    </ItemContext.Provider>
  ))
  return usePart(
    control,
    "root",
    {},
    { ...props, render: controlRender(field, "div", render), children: stars }
  )
}

function RatingRadio({ value }: { value: string }) {
  return (
    <>
      {usePart(rating, "radio", { value }, {}, "button")}
      {usePart(rating, "input", { value }, {}, "input")}
    </>
  )
}

/**
 * One star. Put its icon inside: the state says how full it is, and the
 * radios that pick its score sit over it.
 * @experimental
 */
function RatingItem({
  children,
  ...props
}: PartProps<"span", RatingItemState>) {
  const item = React.useContext(ItemContext)
  if (!item) {
    throw new Error("RatingItem must be used inside <Rating>.")
  }
  const radios = ratingItemValues(item.index, item.step).map((score) => (
    <RatingRadio key={score} value={String(score)} />
  ))
  return usePart(
    rating,
    "item",
    { index: item.index },
    {
      ...props,
      children: (state: RatingItemState) => (
        <>
          {typeof children === "function" ? children(state) : children}
          {radios}
        </>
      ),
    },
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
