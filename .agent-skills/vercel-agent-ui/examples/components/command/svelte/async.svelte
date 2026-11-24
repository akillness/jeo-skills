<script lang="ts">
  import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
    CommandStatus,
  } from "@ui-sdk/svelte/command"
  import { useAsyncOptions } from "@ui-sdk/svelte/async-options"

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
    return new Promise<{ value: string; label: string }[]>(
      (resolve, reject) => {
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
      }
    )
  }

  const issues = useAsyncOptions(searchIssues, {
    debounce: 250,
    immediate: true,
  })
</script>

<Command
  filter={false}
  status={issues.state.status}
  onQueryChange={(query: string) => issues.setQuery(query)}
  onLoadMore={issues.loadMore}
>
  <CommandInput aria-label="Search issues" placeholder="Search issues…" />
  <CommandStatus>
    {#snippet children(state)}
      {state.loading
        ? "Searching…"
        : `${state.count} ${state.count === 1 ? "issue" : "issues"}`}
    {/snippet}
  </CommandStatus>
  <CommandEmpty>
    {#snippet children(state)}
      {#if state.empty && !state.loading}No issues match “{state.query}”.{/if}
    {/snippet}
  </CommandEmpty>
  <CommandList>
    {#each issues.state.items as issue (issue.value)}
      <CommandItem value={issue.value} label={issue.label}>
        {issue.label}
      </CommandItem>
    {/each}
  </CommandList>
</Command>
