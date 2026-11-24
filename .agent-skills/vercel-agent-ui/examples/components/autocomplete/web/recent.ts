import "@ui-sdk/web/autocomplete"

const recent = ["react hooks", "tailwind grid", "web components", "vue v-model"]
const topics = [
  ...recent,
  "react server components",
  "tailwind colors",
  "vue router",
]
const recentSearches = [
  { type: "group" as const, label: "Recent searches", items: recent },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-autocomplete open-on-focus>
      <ui-autocomplete-input>
        <input type="search" aria-label="Search docs" placeholder="Search docs…" />
      </ui-autocomplete-input>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-empty>No topics found.</ui-autocomplete-empty>
        <ui-autocomplete-list></ui-autocomplete-list>
      </ui-autocomplete-content>
      <template>
        <ui-autocomplete-group>
          <ui-autocomplete-group-label></ui-autocomplete-group-label>
          <ui-autocomplete-item>
            <ui-autocomplete-item-text></ui-autocomplete-item-text>
          </ui-autocomplete-item>
        </ui-autocomplete-group>
      </template>
    </ui-autocomplete>
  `
  const autocomplete = root.querySelector("ui-autocomplete")!
  autocomplete.announcement = (change) =>
    change.type === "results"
      ? `${change.count} ${change.count === 1 ? "topic" : "topics"}`
      : null
  autocomplete.emptyItems = recentSearches
  autocomplete.items = topics
}

export { mount }
