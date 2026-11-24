// The listing: what each option of a list shows from the list as a whole, by
// its key, kept in the component's state. Whether the query hides an option
// and whether it's selected depend on state every option shares, like the
// query and the value. An option selects on its own entry instead of on
// those, so typing, choosing and opening reach only the options whose entry
// changed, not every option (`test/selects.test.ts`).
import { type Listbox } from "./listbox-engine"
import { deriveState } from "../kernel/derive"
import { sameValue, type Store } from "../kernel/store"

/** Each option's entry, by key, from `Listbox.listing`. */
type Listing = Readonly<Record<string, string>>

const noListing: Listing = {}

// Keeps `listing` in state current, in the same pass as options that change
// it. It looks again only when the list or `selection`'s inputs changed, and
// never for a highlight move, which changes only live state. Call it first,
// in `api`, so the listing is current before any part looks.
function keepListing<State extends { listing: Listing }>(
  store: Store<State>,
  listbox: Listbox,
  selection?: {
    // What an option adds to its entry, like "s" while it's selected.
    entry: (key: string, value: unknown) => string
    // The state that decides it.
    inputs: () => readonly unknown[]
  }
) {
  let last: { inputs: readonly unknown[]; listing: Listing } | undefined
  deriveState(
    { store },
    ["listing"],
    (state) => {
      const inputs = [
        ...listbox.listingInputs(),
        ...(selection?.inputs() ?? []),
      ]
      if (!last || !sameValue(inputs, last.inputs)) {
        const next = listbox.listing(selection?.entry)
        last = {
          inputs,
          listing: sameEntries(state.listing, next) ? state.listing : next,
        }
      }
      // A cast, since TypeScript can't tell `{ listing }` is a partial of a generic `State`.
      return { listing: last.listing } as Partial<State>
    },
    { live: false }
  )
}

// Entries are strings, so a key only one side has, even one named like an
// inherited property such as `constructor`, never compares equal.
function sameEntries(a: Listing, b: Listing) {
  for (const key in a) {
    if (a[key] !== b[key]) {
      return false
    }
  }
  for (const key in b) {
    if (typeof a[key] !== "string") {
      return false
    }
  }
  return true
}

export { keepListing, type Listing, noListing }
