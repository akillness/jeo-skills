"use client"

import { useAsyncOptions } from "@ui-sdk/react/async-options"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectEmpty,
  SelectInput,
  SelectItem,
  SelectItemIndicator,
  SelectList,
  SelectStatus,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import * as React from "react"

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

function Example() {
  const [query, setQuery] = React.useState("")
  const results = useAsyncOptions(searchCountries, { immediate: true })

  return (
    <Field>
      <FieldLabel>Country</FieldLabel>
      <Select
        items={results.items}
        filter={false}
        status={results.status}
        query={query}
        onQueryChange={(next) => {
          setQuery(next)
          results.setQuery(next)
        }}
        onLoadMore={results.loadMore}
        placeholder="Select a country"
      >
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectInput
            aria-label="Search countries"
            placeholder="Search countries…"
          />
          <SelectEmpty>
            {(state) =>
              state.empty && !state.loading
                ? `No countries match “${state.query}”.`
                : null
            }
          </SelectEmpty>
          <SelectList>
            {(state) =>
              (
                state.items as {
                  value: string
                  label: string
                  disabled?: boolean
                }[]
              ).map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  label={item.label}
                  disabled={item.disabled}
                >
                  {item.label}
                  <SelectItemIndicator>
                    <CheckIcon />
                  </SelectItemIndicator>
                </SelectItem>
              ))
            }
          </SelectList>
          <SelectStatus>
            {(state) =>
              state.loading
                ? "Loading…"
                : state.status === "error"
                  ? "Couldn't load countries."
                  : `${state.count} shown`
            }
          </SelectStatus>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
