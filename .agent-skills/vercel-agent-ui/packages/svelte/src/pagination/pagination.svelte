<!--
@component
A navigation landmark around the page links. Name it with `aria-label`.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    pagination as paginationPrimitive,
    type PaginationController,
    type PaginationPageChangeReason,
    type PaginationState,
  } from "@ui-sdk/core/pagination"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { PaginationKey, type PaginationContext } from "./context"

  type Details = ChangeDetails<PaginationPageChangeReason>

  let {
    page = $bindable(),
    defaultPage,
    pageCount,
    total,
    pageSize,
    siblings,
    boundaries,
    getHref,
    disabled,
    controller,
    debug,
    onPageChange,
    ...rest
  }: PartProps<"nav", PaginationState> & {
    /** The current page, from 1. Bind it with `bind:page` to control the pagination. */
    page?: number
    /** The page it starts on, when uncontrolled. */
    defaultPage?: number
    /** How many pages there are. Or pass `total` and `pageSize`. */
    pageCount?: number
    /** How many items there are, for `pageCount` from `pageSize`. */
    total?: number
    /** How many items fit on a page, with `total`. */
    pageSize?: number
    /** How many pages show on each side of the current one. */
    siblings?: number
    /** How many pages always show at each end. */
    boundaries?: number
    /** The URL of a page. With it, parts are links that work before JavaScript loads. Without it, they're buttons. */
    getHref?: (page: number) => string
    /** Whether every page and step does nothing, like a step at its end. A controller still pages it. */
    disabled?: boolean
    /** Pages it from anywhere. Create one with `createPaginationController()`. */
    controller?: PaginationController
    /** Logs every change with its reason. */
    debug?: boolean
    /** Runs when the page wants to change. `details.cancel()` keeps the page, and stops a link from navigating. */
    onPageChange?: (page: number, details: Details) => void
  } = $props()

  const id = $props.id()
  const pagination = usePrimitive(paginationPrimitive, () => ({
    id,
    get page() {
      return page
    },
    defaultPage,
    pageCount,
    total,
    pageSize,
    siblings,
    boundaries,
    getHref,
    disabled,
    controller,
    debug,
    onPageChange: (next: number, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `page` as it was.
      onPageChange?.(next, details)
      if (!details.canceled) {
        page = next
      }
    },
  }))
  const context: PaginationContext = {
    instance: pagination.instance,
    api: pagination.api,
    controls: pagination.controls,
    get state() {
      return pagination.state
    },
    tag: () => (getHref ? "a" : "button"),
  }
  setContext(PaginationKey, context)
  const root = useHandlePart(pagination, "root")
</script>

<Part tag="nav" part={root} props={rest} />
