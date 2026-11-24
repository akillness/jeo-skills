import { createAsyncOptions } from "@ui-sdk/core/async-options"
import "@ui-sdk/web/command"

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

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-command filter="false">
      <ui-command-input>
        <input aria-label="Search issues" placeholder="Search issues…" />
      </ui-command-input>
      <ui-command-status></ui-command-status>
      <ui-command-empty>No issues match “<span></span>”.</ui-command-empty>
      <ui-command-list></ui-command-list>
      <template>
        <ui-command-item>
        </ui-command-item>
      </template>
    </ui-command>
  `
  const command = root.querySelector("ui-command")!
  const status = root.querySelector("ui-command-status")!
  const query = root.querySelector("ui-command-empty span")!
  const issues = createAsyncOptions(searchIssues, {
    debounce: 250,
    immediate: true,
  })
  const update = () => {
    const { items, status: loading } = issues.getState()
    command.items = items
    command.setAttribute("status", loading)
    status.textContent =
      loading === "loading"
        ? "Searching…"
        : `${items.length} ${items.length === 1 ? "issue" : "issues"}`
  }
  issues.subscribe(update)
  update()
  command.addEventListener("querychange", (event) => {
    query.textContent = event.detail.value
    issues.setQuery(event.detail.value)
  })
  command.addEventListener("loadmore", () => issues.loadMore())
}

export { mount }
