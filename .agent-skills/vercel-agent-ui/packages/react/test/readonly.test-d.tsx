// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import { AutocompleteInput } from "../src/autocomplete"
import { ComboboxInput } from "../src/combobox"
import { DatePickerInput } from "../src/date-picker"
import { NumberInputControl } from "../src/number-input"

// The core never sees a part's `readOnly`: it goes on the root.
// @ts-expect-error
const numberInput = <NumberInputControl readOnly />
// @ts-expect-error
const combobox = <ComboboxInput readOnly />
// @ts-expect-error
const autocomplete = <AutocompleteInput readOnly />
// @ts-expect-error
const datePicker = <DatePickerInput readOnly />

export { autocomplete, combobox, datePicker, numberInput }
