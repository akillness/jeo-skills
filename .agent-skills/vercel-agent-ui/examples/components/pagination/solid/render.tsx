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
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m12 19-7-7 7-7" />
                      <path d="M19 12H5" />
                    </svg>
                    {!state.disabled && (
                      <span aria-hidden="true">{state.page}</span>
                    )}
                  </>
                )}
              </PaginationPrevious>
            </PaginationItem>
            <For each={items}>
              {(item) => (
                <PaginationItem>
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
              )}
            </For>
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
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
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
