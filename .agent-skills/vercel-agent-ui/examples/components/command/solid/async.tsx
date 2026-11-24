import { useAsyncOptions } from "@ui-sdk/solid/async-options"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandStatus,
} from "@ui-sdk/solid/command"
import { For } from "solid-js"

function searchIssues(query: string, { signal }: { signal: AbortSignal }) {
  const issues = [
    "Fix login redirect",
    "Dark mode flicker",
    "Add billing page",
    "Search is slow",
    "Update dependencies",
    "Crash on upload",
    "Export to CSV",
    "Keyboard shortcuts help",
  ]
  return new Promise<{ value: string; label: string }[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      const needle = query.trim().toLowerCase()
      resolve(
        issues
          .filter((issue) => issue.toLowerCase().includes(needle))
          .map((issue) => ({
            value: issue.toLowerCase().replaceAll(" ", "-"),
            label: issue,
          }))
      )
    }, 400)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

function Example() {
  const issues = useAsyncOptions(searchIssues, {
    debounce: 250,
    immediate: true,
  })

  return (
    <Command
      filter={false}
      status={issues.status}
      onQueryChange={(query) => issues.setQuery(query)}
      onLoadMore={issues.loadMore}
    >
      <CommandInput aria-label="Search issues" placeholder="Search issues…" />
      <CommandStatus>
        {(state) =>
          state.loading
            ? "Searching…"
            : `${state.count} ${state.count === 1 ? "issue" : "issues"}`
        }
      </CommandStatus>
      <CommandEmpty>
        {(state) =>
          state.empty && !state.loading
            ? `No issues match “${state.query}”.`
            : null
        }
      </CommandEmpty>
      <CommandList>
        <For each={issues.items}>
          {(issue) => (
            <CommandItem value={issue.value} label={issue.label}>
              {issue.label}
            </CommandItem>
          )}
        </For>
      </CommandList>
    </Command>
  )
}

export { Example }
