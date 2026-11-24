import {
  pagination,
  type PaginationLinkProps,
  type PaginationLinkState,
  type PaginationStepState,
} from "@ui-sdk/core/pagination"
import {
  createParts,
  useHandle,
  usePart,
  type PartProps,
} from "./use-primitive"

const parts = createParts(pagination, {
  root: "nav",
  list: "ul",
  item: "li",
  ellipsis: "span",
})

// Parts are links with `getHref`, and buttons without. A change to `getHref`
// changes their attributes, so they render again and read it.
function useTag() {
  return useHandle(pagination).state.getHref
    ? ("a" as const)
    : ("button" as const)
}

/**
 * A navigation landmark around the page links. Name it with `aria-label`.
 * @stable
 */
const Pagination = parts.Root

/**
 * The list of pages and steps. Its children can be a function of the state,
 * whose `items` are the pages to show.
 * @stable
 */
const PaginationList = parts.List

/**
 * One entry in the list, around a link, a step or an ellipsis.
 * @stable
 */
const PaginationItem = parts.Item

/**
 * A page. The current one has `aria-current="page"`. Shows its number unless it has children.
 * @stable
 */
function PaginationLink({
  page,
  children = page,
  ...props
}: PartProps<"a", PaginationLinkState> & PaginationLinkProps) {
  // Links are told apart by their page.
  return usePart(
    pagination,
    "link",
    { page, id: String(page) },
    { ...props, children },
    useTag()
  )
}

type StepProps = PartProps<"a", PaginationStepState>

function useStep(
  name: "previous" | "next" | "first" | "last",
  props: StepProps
) {
  return usePart(pagination, name, {}, props, useTag())
}

/**
 * Goes to the previous page. `aria-disabled` on the first page, where it stays focusable.
 * @stable
 */
function PaginationPrevious(props: StepProps) {
  return useStep("previous", props)
}

/**
 * Goes to the next page. `aria-disabled` on the last page, where it stays focusable.
 * @stable
 */
function PaginationNext(props: StepProps) {
  return useStep("next", props)
}

/**
 * Goes to the first page. `aria-disabled` there.
 * @stable
 */
function PaginationFirst(props: StepProps) {
  return useStep("first", props)
}

/**
 * Goes to the last page. `aria-disabled` there.
 * @stable
 */
function PaginationLast(props: StepProps) {
  return useStep("last", props)
}

/**
 * A gap in the range. Hidden from screen readers, since the links around it
 * say which pages there are. Shows "…" unless it has children.
 * @stable
 */
function PaginationEllipsis({ children = "…", ...props }: PartProps<"span">) {
  return <parts.Ellipsis {...props}>{children}</parts.Ellipsis>
}

export {
  createPaginationController,
  paginationRange,
} from "@ui-sdk/core/pagination"
export type {
  PaginationChangeOptions,
  PaginationController,
  PaginationLinkProps,
  PaginationLinkState,
  PaginationOptions,
  PaginationPageChangeReason,
  PaginationPrimitive,
  PaginationRangeItem,
  PaginationRangeOptions,
  PaginationState,
  PaginationStepState,
} from "@ui-sdk/core/pagination"

export {
  Pagination,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
}
