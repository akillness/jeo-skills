// Importing this defines <ui-pagination> and its parts. On the server it does nothing.
import { definePaginationElements } from "../pagination"

definePaginationElements()

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
export type { PaginationEvents, UiPaginationElement } from "../events"
export {
  createPaginationController,
  paginationRange,
} from "@ui-sdk/core/pagination"
