"use client"

import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from "@ui-sdk/react/pagination"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

function Example() {
  return (
    <Pagination aria-label="Pagination" pageCount={10}>
      <PaginationList>
        {({ items }) => (
          <>
            <PaginationItem>
              <PaginationPrevious
                aria-label="Previous page"
                render={(props, state) => (
                  <button
                    {...props}
                    title={
                      state.disabled ? undefined : `Go to page ${state.page}`
                    }
                  />
                )}
              >
                {(state) => (
                  <>
                    <ArrowLeftIcon aria-hidden="true" />
                    {!state.disabled && (
                      <span aria-hidden="true">{state.page}</span>
                    )}
                  </>
                )}
              </PaginationPrevious>
            </PaginationItem>
            {items.map((item) => (
              <PaginationItem key={item}>
                {typeof item === "number" ? (
                  <PaginationLink page={item}>
                    {(state) =>
                      state.current ? `Page ${state.page}` : state.page
                    }
                  </PaginationLink>
                ) : (
                  <PaginationEllipsis />
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                aria-label="Next page"
                render={(props, state) => (
                  <button
                    {...props}
                    title={
                      state.disabled ? undefined : `Go to page ${state.page}`
                    }
                  />
                )}
              >
                {(state) => (
                  <>
                    {!state.disabled && (
                      <span aria-hidden="true">{state.page}</span>
                    )}
                    <ArrowRightIcon aria-hidden="true" />
                  </>
                )}
              </PaginationNext>
            </PaginationItem>
          </>
        )}
      </PaginationList>
    </Pagination>
  )
}

export { Example }
