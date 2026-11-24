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
import { ChevronLeftIcon, ChevronRightIcon, EllipsisIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Pagination
      aria-label="Pagination"
      pageCount={10}
      onPageChange={(page, details) => log(`Page ${page} (${details.reason})`)}
    >
      <PaginationList>
        {({ items }) => (
          <>
            <PaginationItem>
              <PaginationPrevious data-variant="ghost">
                <ChevronLeftIcon />
                <span data-slot="visually-hidden">Previous</span>
              </PaginationPrevious>
            </PaginationItem>
            {items.map((item) => (
              <PaginationItem key={item}>
                {typeof item === "number" ? (
                  <PaginationLink data-variant="ghost" page={item} />
                ) : (
                  <PaginationEllipsis>
                    <EllipsisIcon />
                  </PaginationEllipsis>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext data-variant="ghost">
                <span data-slot="visually-hidden">Next</span>
                <ChevronRightIcon />
              </PaginationNext>
            </PaginationItem>
          </>
        )}
      </PaginationList>
    </Pagination>
  )
}

export { Example }
