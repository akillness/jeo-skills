import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from "@ui-sdk/solid/pagination"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [page, setPage] = createSignal(2)
  const [pageSize, setPageSize] = createSignal(20)
  const total = 95

  return (
    <div data-slot="stack">
      <div data-slot="row">
        <p>
          Showing {(page() - 1) * pageSize() + 1}–
          {Math.min(page() * pageSize(), total)} of {total}
        </p>
        <label data-slot="label">
          Rows per page
          <select
            value={pageSize()}
            onChange={(event) => {
              setPageSize(Number(event.currentTarget.value))
              setPage(1)
              log(`${event.currentTarget.value} rows per page`)
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
        pageSize={pageSize()}
        page={page()}
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
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  <span data-slot="visually-hidden">Previous</span>
                </PaginationPrevious>
              </PaginationItem>
              <For each={items}>
                {(item) => (
                  <PaginationItem>
                    {typeof item === "number" ? (
                      <PaginationLink data-variant="ghost" page={item} />
                    ) : (
                      <PaginationEllipsis>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="19" cy="12" r="1" />
                          <circle cx="5" cy="12" r="1" />
                        </svg>
                      </PaginationEllipsis>
                    )}
                  </PaginationItem>
                )}
              </For>
              <PaginationItem>
                <PaginationNext data-variant="ghost">
                  <span data-slot="visually-hidden">Next</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
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
