import { createAsyncOptions } from "@ui-sdk/core/async-options"
import "@ui-sdk/web/autocomplete"

function searchCities(query: string, { signal }: { signal: AbortSignal }) {
  const cities = [
    "Amsterdam",
    "Athens",
    "Barcelona",
    "Berlin",
    "Boston",
    "Brussels",
    "Buenos Aires",
    "Cairo",
    "Chicago",
    "Copenhagen",
    "Dublin",
    "Lisbon",
    "London",
    "Los Angeles",
    "Madrid",
    "Paris",
    "Prague",
    "Rome",
    "Seoul",
    "Tokyo",
  ]
  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      const needle = query.trim().toLowerCase()
      resolve(cities.filter((city) => city.toLowerCase().startsWith(needle)))
    }, 300)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    })
  })
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-autocomplete filter="false">
      <div data-slot="stack">
        <ui-autocomplete-label>City</ui-autocomplete-label>
        <ui-autocomplete-input>
          <input placeholder="e.g. Paris" />
        </ui-autocomplete-input>
      </div>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-status></ui-autocomplete-status>
        <ui-autocomplete-empty>No cities start with “<span></span>”.</ui-autocomplete-empty>
        <ui-autocomplete-list></ui-autocomplete-list>
      </ui-autocomplete-content>
      <template>
        <ui-autocomplete-item>
        </ui-autocomplete-item>
      </template>
    </ui-autocomplete>
  `
  const autocomplete = root.querySelector("ui-autocomplete")!
  const status = root.querySelector("ui-autocomplete-status")!
  const query = root.querySelector("ui-autocomplete-empty span")!
  const results = createAsyncOptions(searchCities, { debounce: 200 })
  const update = () => {
    const { items, status: loading } = results.getState()
    autocomplete.items = items
    autocomplete.setAttribute("status", loading)
    status.textContent =
      loading === "loading"
        ? "Searching…"
        : items.length
          ? `${items.length} ${items.length === 1 ? "city" : "cities"}`
          : ""
  }
  results.subscribe(update)
  update()
  autocomplete.addEventListener("valuechange", (event) => {
    query.textContent = event.detail.value
    results.setQuery(event.detail.value)
  })
  autocomplete.addEventListener("loadmore", () => results.loadMore())
}

export { mount }
