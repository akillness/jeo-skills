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
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [page, setPage] = React.useState(2)
  const [pageSize, setPageSize] = React.useState(20)
  const total = 95

  return (
    <div data-slot="stack">
      <div data-slot="row">
        <p>
          Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}{" "}
          of {total}
        </p>
        <label data-slot="label">
          Rows per page
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPage(1)
              log(`${event.target.value} rows per page`)
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
      <Pagination
        aria-label="Pagination"
        total={total}
        pageSize={pageSize}
        page={page}
        onPageChange={(next) => {
          setPage(next)
          log(`Page ${next}`)
        }}
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
    </div>
  )
}

export { Example }
