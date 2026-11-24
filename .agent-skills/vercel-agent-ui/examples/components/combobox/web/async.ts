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

function searchMovies(query: string, { signal }: { signal: AbortSignal }) {
  return new Promise<{ value: string; label: string }[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      const needle = query.trim().toLowerCase()
      resolve(
        movieTitles
          .filter((title) => title.toLowerCase().includes(needle))
          .map((title) => ({
            value: title.toLowerCase().replace(/\W+/g, "-"),
            label: title,
          }))
      )
    }, 500)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox filter="false" default-query="the">
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
        <ui-combobox-status></ui-combobox-status>
        <ui-combobox-empty>No movies match “<span>the</span>”.</ui-combobox-empty>
        <ui-combobox-list></ui-combobox-list>
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
  const query = root.querySelector("ui-combobox-empty span")!
  const movies = createAsyncOptions(searchMovies, {
    debounce: 300,
    query: "the",
    immediate: true,
  })
  const update = () => {
    const { items, status: loading } = movies.getState()
    combobox.items = items
    combobox.setAttribute("status", loading)
    status.textContent =
      loading === "error"
        ? "Couldn't load movies."
        : loading === "loading"
          ? "Searching…"
          : `${items.length} ${items.length === 1 ? "movie" : "movies"}`
  }
  movies.subscribe(update)
  update()
  combobox.addEventListener("querychange", (event) => {
    query.textContent = event.detail.value
    movies.setQuery(event.detail.value)
  })
}

export { mount }
