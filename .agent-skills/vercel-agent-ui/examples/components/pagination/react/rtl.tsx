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

function Example() {
  return (
    <div dir="rtl">
      <Pagination aria-label="ترقيم الصفحات" pageCount={10}>
        <PaginationList>
          {({ items }) => (
            <>
              <PaginationItem>
                <PaginationPrevious data-variant="ghost">
                  <ChevronLeftIcon />
                  <span data-slot="visually-hidden">السابق</span>
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
                  <span data-slot="visually-hidden">التالي</span>
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
