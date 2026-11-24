import type { pagination } from "@ui-sdk/core/pagination"
import { getContext } from "svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type PaginationContext = PrimitiveHandle<typeof pagination> & {
  // Parts are links with `getHref`, and buttons without.
  tag: () => "a" | "button"
}

const PaginationKey = Symbol("pagination")

function usePagination(part: string) {
  const context = getContext<PaginationContext | undefined>(PaginationKey)
  if (!context) {
    throw new Error(`${part} must be used inside <Pagination>.`)
  }
  return context
}

export { type PaginationContext, PaginationKey, usePagination }
