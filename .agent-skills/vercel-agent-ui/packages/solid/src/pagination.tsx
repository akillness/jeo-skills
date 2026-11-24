import {
  pagination as paginationPrimitive,
  type PaginationLinkProps,
  type PaginationLinkState,
  type PaginationOptions,
  type PaginationRangeItem,
  type PaginationState,
  type PaginationStepState,
} from "@ui-sdk/core/pagination"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  createProjection,
  getOwner,
  merge,
  omit,
  runWithOwner,
  useContext,
  type ComponentProps,
} from "solid-js"
import {
  createParts,
  renderAs,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(paginationPrimitive, { item: "li", ellipsis: "span" })

type PaginationContextValue = PrimitiveHandle<typeof paginationPrimitive> & {
  // Parts are links with `getHref`, and buttons without.
  tag: () => "a" | "button"
}

const PaginationContext = createContext<PaginationContextValue | null>(null)

function usePagination(part: string) {
  const context = useContext(PaginationContext)
  if (!context) {
    throw new Error(`${part} must be used inside <Pagination>.`)
  }
  return context
}

// The part's element, unless the user renders their own: a link or a button, as the pagination decides.
function tagged(
  pagination: PaginationContextValue,
  props: Record<string, any>
) {
  return merge(props, {
    get render() {
      return props.render ?? renderAs(pagination.tag)
    },
  })
}

/**
 * A navigation landmark around the page links. Name it with `aria-label`.
 * @stable
 */
const Pagination = /* @__PURE__ */ rootScope(function Pagination(
  props: PaginationOptions & PartProps<"nav", PaginationState>
) {
  const pagination = usePrimitive(paginationPrimitive, () => ({
    page: props.page,
    defaultPage: props.defaultPage,
    onPageChange: props.onPageChange,
    pageCount: props.pageCount,
    total: props.total,
    pageSize: props.pageSize,
    siblings: props.siblings,
    boundaries: props.boundaries,
    getHref: props.getHref,
    disabled: props.disabled,
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "page",
    "defaultPage",
    "onPageChange",
    "pageCount",
    "total",
    "pageSize",
    "siblings",
    "boundaries",
    "getHref",
    "disabled",
    "controller",
    "debug"
  )
  // Merged, not spread: the handle's `state` is a getter.
  const context = merge(pagination, {
    tag: () => (props.getHref ? ("a" as const) : ("button" as const)),
  })
  return (
    <PaginationContext value={context}>
      {usePart(pagination, "root", undefined, rest, "nav")}
    </PaginationContext>
  )
})

/**
 * The list of pages and steps. Its children can be a function of the state,
 * whose `items` are the pages to show.
 * @stable
 */
function PaginationList(props: PartProps<"ul", PaginationState>) {
  const pagination = usePagination("PaginationList")
  const owner = getOwner()
  let view: PaginationState | undefined
  // The range is a new array on every page, so children that destructure
  // `items` would render again from scratch, and the pressed link's focus
  // with it. A projection keeps one array and changes only the entries that
  // differ, so a `For` over it keeps the links that stay, and it derives in
  // the same pass as the page, so children never see a page with the
  // previous range. Made once, under the list, the first time its children
  // render.
  const withItems = (state: PaginationState) => {
    if (view) {
      return view
    }
    const items = runWithOwner(owner, () =>
      createProjection<PaginationRangeItem[]>(() => state.items, [])
    )
    return (view = new Proxy(state, {
      get: (target, key) =>
        key === "items" ? items : target[key as keyof PaginationState],
    }))
  }
  const children = (state: PaginationState) => {
    const content = props.children
    if (typeof content === "function" && content.length > 0) {
      return content(withItems(state))
    }
    // A function that takes nothing is a child component's accessor, which renders as it is.
    return content as JSX.Element
  }
  return usePart(
    pagination,
    "list",
    undefined,
    merge(props, { children }),
    "ul"
  )
}

/**
 * One entry in the list, around a link, a step or an ellipsis.
 * @stable
 */
const PaginationItem = parts.Item

/**
 * A page. The current one has `aria-current="page"`. Shows its number unless it has children.
 * @stable
 */
function PaginationLink(
  props: PartProps<"a", PaginationLinkState> & PaginationLinkProps
) {
  const pagination = usePagination("PaginationLink")
  // Keyed by its page, which isn't a string value.
  const part = () => ({ page: props.page, id: String(props.page) })
  const rest = merge(tagged(pagination, omit(props, "page")), {
    get children() {
      return props.children ?? props.page
    },
  })
  return usePart(pagination, "link", part, rest, "button")
}

type StepProps = PartProps<"a", PaginationStepState>

function stepPart(
  name: "previous" | "next" | "first" | "last",
  part: string,
  props: StepProps
) {
  const pagination = usePagination(part)
  return usePart(
    pagination,
    name,
    undefined,
    tagged(pagination, props),
    "button"
  )
}

/**
 * Goes to the previous page. `aria-disabled` on the first page, where it stays focusable.
 * @stable
 */
function PaginationPrevious(props: StepProps) {
  return stepPart("previous", "PaginationPrevious", props)
}

/**
 * Goes to the next page. `aria-disabled` on the last page, where it stays focusable.
 * @stable
 */
function PaginationNext(props: StepProps) {
  return stepPart("next", "PaginationNext", props)
}

/**
 * Goes to the first page. `aria-disabled` there.
 * @stable
 */
function PaginationFirst(props: StepProps) {
  return stepPart("first", "PaginationFirst", props)
}

/**
 * Goes to the last page. `aria-disabled` there.
 * @stable
 */
function PaginationLast(props: StepProps) {
  return stepPart("last", "PaginationLast", props)
}

/**
 * A gap in the range. Hidden from screen readers, since the links around it
 * say which pages there are. Shows "…" unless it has children.
 * @stable
 */
function PaginationEllipsis(props: ComponentProps<typeof parts.Ellipsis>) {
  return <parts.Ellipsis {...props}>{props.children ?? "…"}</parts.Ellipsis>
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
