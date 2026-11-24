import { createAsyncOptions } from "@ui-sdk/core/async-options"
import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement } from "lucide"

const movieTitles = [
  "The Shawshank Redemption",
  "The Godfather",
  "The Dark Knight",
  "Pulp Fiction",
  "Schindler's List",
  "The Lord of the Rings",
  "Fight Club",
  "Forrest Gump",
  "Inception",
  "The Matrix",
  "Goodfellas",
  "Interstellar",
  "Parasite",
  "Spirited Away",
  "Whiplash",
  "The Prestige",
  "The Departed",
  "Gladiator",
  "Alien",
  "Casablanca",
  "Amélie",
  "Arrival",
]

function searchMoviePages(
  query: string,
  { signal, page }: { signal: AbortSignal; page: number }
) {
  return new Promise<{
    items: { value: string; label: string }[]
    hasMore: boolean
  }>((resolve, reject) => {
    const timer = setTimeout(() => {
      const needle = query.trim().toLowerCase()
      const found = movieTitles
        .filter((title) => title.toLowerCase().includes(needle))
        .map((title) => ({
          value: title.toLowerCase().replace(/\W+/g, "-"),
          label: title,
        }))
      resolve({
        items: found.slice(page * 5, page * 5 + 5),
        hasMore: found.length > page * 5 + 5,
      })
    }, 500)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox filter="false">
      <div data-slot="stack">
        <ui-combobox-label>Movie</ui-combobox-label>
        <div data-slot="row">
          <ui-combobox-input>
            <input placeholder="Search movies…" />
          </ui-combobox-input>
          <ui-combobox-trigger>
            <button aria-label="Show movies">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-combobox-trigger>
        </div>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>No movies found.</ui-combobox-empty>
        <ui-combobox-list></ui-combobox-list>
        <ui-combobox-status></ui-combobox-status>
      </ui-combobox-content>
      <template>
        <ui-combobox-item>
          <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
        </ui-combobox-item>
      </template>
    </ui-combobox>
  `
  const combobox = root.querySelector("ui-combobox")!
  const status = root.querySelector("ui-combobox-status")!
  const movies = createAsyncOptions(searchMoviePages, { immediate: true })
  const update = () => {
    const { items, status: loading, hasMore } = movies.getState()
    combobox.items = items
    combobox.setAttribute("status", loading)
    status.textContent =
      loading === "loading"
        ? "Loading more…"
        : hasMore
          ? `${items.length} loaded`
          : `All ${items.length}`
  }
  movies.subscribe(update)
  update()
  combobox.addEventListener("querychange", (event) =>
    movies.setQuery(event.detail.value)
  )
  combobox.addEventListener("loadmore", () => movies.loadMore())
}

export { mount }
