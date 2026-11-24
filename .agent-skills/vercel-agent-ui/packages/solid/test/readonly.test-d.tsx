// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import { AutocompleteInput } from "../src/autocomplete"
import { ComboboxInput } from "../src/combobox"
import { DatePickerInput } from "../src/date-picker"
import { NumberInputControl } from "../src/number-input"

// The core never sees a part's `readonly`: `readOnly` goes on the root.
// @ts-expect-error
const numberInput = <NumberInputControl readonly />
// @ts-expect-error
const combobox = <ComboboxInput readonly />
// @ts-expect-error
const autocomplete = <AutocompleteInput readonly />
// @ts-expect-error
const datePicker = <DatePickerInput readonly />

export { autocomplete, combobox, datePicker, numberInput }
