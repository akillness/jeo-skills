import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from "@ui-sdk/solid/pagination"
import { For } from "solid-js"

function Example() {
  return (
    <div dir="rtl">
      <Pagination aria-label="ترقيم الصفحات" pageCount={10}>
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
                  <span data-slot="visually-hidden">السابق</span>
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
                  <span data-slot="visually-hidden">التالي</span>
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
