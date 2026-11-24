import { createAsyncOptions } from "@ui-sdk/core/async-options"
import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const countryList = [
  { value: "ar", label: "Argentina" },
  { value: "au", label: "Australia" },
  { value: "at", label: "Austria" },
  { value: "be", label: "Belgium" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "cn", label: "China" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "gr", label: "Greece" },
  { value: "in", label: "India" },
  { value: "ie", label: "Ireland" },
  { value: "it", label: "Italy" },
  { value: "jp", label: "Japan" },
  { value: "mx", label: "Mexico" },
  { value: "nl", label: "Netherlands" },
  { value: "no", label: "Norway" },
  { value: "pt", label: "Portugal" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
  { value: "ch", label: "Switzerland" },
]

function searchCountries(
  query: string,
  { signal, page }: { signal: AbortSignal; page: number }
) {
  return new Promise<{ items: typeof countryList; hasMore: boolean }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        const needle = query.trim().toLowerCase()
        const found = countryList.filter((country) =>
          country.label.toLowerCase().includes(needle)
        )
        resolve({
          items: found.slice(page * 6, page * 6 + 6),
          hasMore: found.length > page * 6 + 6,
        })
      }, 400)
      signal.addEventListener("abort", () => {
        clearTimeout(timer)
        reject(signal.reason)
      })
    }
  )
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Country</ui-field-label>
      <ui-select filter="false" placeholder="Select a country">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          <ui-select-input>
            <input aria-label="Search countries" placeholder="Search countries…" />
          </ui-select-input>
          <ui-select-empty></ui-select-empty>
          <ui-select-list></ui-select-list>
          <ui-select-status></ui-select-status>
        </ui-select-content>
        <template>
          <ui-select-item>
            <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
          </ui-select-item>
        </template>
      </ui-select>
    </ui-field>
  `
  const select = root.querySelector("ui-select")!
  const empty = root.querySelector("ui-select-empty")!
  const status = root.querySelector("ui-select-status")!
  const results = createAsyncOptions(searchCountries, { immediate: true })
  let query = ""
  const update = () => {
    const { items, status: loading } = results.getState()
    select.items = items
    select.setAttribute("status", loading)
    empty.textContent =
      loading === "loading" ? "" : `No countries match “${query}”.`
    status.textContent =
      loading === "loading"
        ? "Loading…"
        : loading === "error"
          ? "Couldn't load countries."
          : `${items.length} shown`
  }
  results.subscribe(update)
  update()
  select.addEventListener("querychange", (event) => {
    query = event.detail.value
    results.setQuery(query)
    update()
  })
  select.addEventListener("loadmore", () => results.loadMore())
}

export { mount }
