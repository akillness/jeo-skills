<script setup lang="ts">
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandStatus,
} from "@ui-sdk/vue/command"
import { useAsyncOptions } from "@ui-sdk/vue/async-options"

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

const {
  state: issues,
  setQuery,
  loadMore,
} = useAsyncOptions(searchIssues, { debounce: 250, immediate: true })
</script>

<template>
  <Command
    :filter="false"
    :status="issues.status"
    @query-change="(query: string) => setQuery(query)"
    @load-more="loadMore"
  >
    <CommandInput aria-label="Search issues" placeholder="Search issues…" />
    <CommandStatus v-slot="{ state }">
      {{
        state.loading
          ? "Searching…"
          : `${state.count} ${state.count === 1 ? "issue" : "issues"}`
      }}
    </CommandStatus>
    <CommandEmpty v-slot="{ state }">
      <template v-if="state.empty && !state.loading"
        >No issues match “{{ state.query }}”.</template
      >
    </CommandEmpty>
    <CommandList>
      <CommandItem
        v-for="issue in issues.items"
        :key="issue.value"
        :value="issue.value"
        :label="issue.label"
      >
        {{ issue.label }}
      </CommandItem>
    </CommandList>
  </Command>
</template>
