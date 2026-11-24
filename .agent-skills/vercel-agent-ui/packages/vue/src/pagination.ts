import type { ChangeDetails } from "@ui-sdk/core"
import {
  pagination as paginationPrimitive,
  type PaginationController,
  type PaginationPageChangeReason,
} from "@ui-sdk/core/pagination"
import {
  defineComponent,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import { slotContent } from "./children"
import { createParts, withElement } from "./create-parts"
import { orModel, usePart, usePrimitive, type PartSlots } from "./use-primitive"

// Parts are links with `getHref`, and buttons without.
const TagKey: InjectionKey<() => "a" | "button"> = Symbol("pagination-tag")

// A link or step's tag: the root's, which follows `getHref`.
function useTag(part: string) {
  const tag = inject(TagKey, null)
  if (!tag) {
    throw new Error(`${part} must be used inside <Pagination>.`)
  }
  return tag
}

const parts = createParts(paginationPrimitive, { list: "ul", item: "li" })

/**
 * A navigation landmark around the page links. Name it with `aria-label`.
 * @stable
 */
const Pagination = withElement(
  "nav",
  defineComponent({
    name: "Pagination",
    inheritAttrs: false,
    props: {
      page: { type: Number, default: undefined },
      modelValue: { type: Number, default: undefined },
      defaultPage: { type: Number, default: undefined },
      pageCount: { type: Number, default: undefined },
      total: { type: Number, default: undefined },
      pageSize: { type: Number, default: undefined },
      siblings: { type: Number, default: undefined },
      boundaries: { type: Number, default: undefined },
      getHref: Function as PropType<(page: number) => string>,
      disabled: { type: Boolean, default: undefined },
      controller: Object as PropType<PaginationController>,
      debug: { type: Boolean, default: undefined },
    },
    emits: {
      "update:page": (_page: number) => true,
      "update:modelValue": (_page: number) => true,
      pageChange: (
        _page: number,
        _details: ChangeDetails<PaginationPageChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof paginationPrimitive, "root">,
    setup(props, { emit }) {
      const pagination = usePrimitive(paginationPrimitive, () => ({
        page: orModel(props.page, props.modelValue),
        defaultPage: props.defaultPage,
        pageCount: props.pageCount,
        total: props.total,
        pageSize: props.pageSize,
        siblings: props.siblings,
        boundaries: props.boundaries,
        getHref: props.getHref,
        disabled: props.disabled,
        controller: props.controller,
        debug: props.debug,
        // The change event runs first, so canceling it also keeps v-model as it was.
        onPageChange: (
          page: number,
          details: ChangeDetails<PaginationPageChangeReason>
        ) => {
          emit("pageChange", page, details)
          if (details.canceled) {
            return
          }
          emit("update:page", page)
          emit("update:modelValue", page)
        },
      }))
      provide(TagKey, () => (props.getHref ? "a" : "button"))
      return usePart(pagination, "root", undefined, undefined, "nav")
    },
  })
)

/**
 * The list of pages and steps. Its default slot gets `{ state }`, whose `items` are the pages to show.
 * @stable
 */
const PaginationList = parts.List

/**
 * One entry in the list, around a link, a step or an ellipsis.
 * @stable
 */
const PaginationItem = parts.Item

/**
 * A gap in the range. Hidden from screen readers, since the links around it
 * say which pages there are. Shows "…" unless it has content.
 * @stable
 */
const PaginationEllipsis = withElement(
  "span",
  defineComponent({
    name: "PaginationEllipsis",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof paginationPrimitive, "ellipsis">,
    setup(_, { slots }) {
      return usePart(paginationPrimitive, "ellipsis", undefined, undefined, {
        tag: "span",
        children: (state) => slotContent(slots.default, { state }) ?? "…",
      })
    },
  })
)

/**
 * A page. The current one has `aria-current="page"`. Shows its number unless it has content.
 * @stable
 */
const PaginationLink = withElement(
  "a",
  defineComponent({
    name: "PaginationLink",
    inheritAttrs: false,
    props: { page: { type: Number, required: true } },
    slots: Object as PartSlots<typeof paginationPrimitive, "link">,
    setup(props, { slots }) {
      const tag = useTag("PaginationLink")
      const part = () => ({ page: props.page, id: String(props.page) })
      return usePart(paginationPrimitive, "link", part, undefined, {
        get tag() {
          return tag()
        },
        children: (state) =>
          slotContent(slots.default, { state }) ?? String(props.page),
      })
    },
  })
)

function stepPart<S extends "previous" | "next" | "first" | "last">(
  name: string,
  slot: S
) {
  return withElement(
    "a",
    defineComponent({
      name,
      inheritAttrs: false,
      slots: Object as PartSlots<typeof paginationPrimitive, S>,
      setup() {
        const tag = useTag(name)
        return usePart(paginationPrimitive, slot, undefined, undefined, {
          get tag() {
            return tag()
          },
        })
      },
    })
  )
}

/**
 * Goes to the previous page. `aria-disabled` on the first page, where it stays focusable.
 * @stable
 */
const PaginationPrevious = stepPart("PaginationPrevious", "previous")
/**
 * Goes to the next page. `aria-disabled` on the last page, where it stays focusable.
 * @stable
 */
const PaginationNext = stepPart("PaginationNext", "next")
/**
 * Goes to the first page. `aria-disabled` there.
 * @stable
 */
const PaginationFirst = stepPart("PaginationFirst", "first")
/**
 * Goes to the last page. `aria-disabled` there.
 * @stable
 */
const PaginationLast = stepPart("PaginationLast", "last")

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
