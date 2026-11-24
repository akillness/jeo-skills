import { Combobox } from "../src/combobox"
import { Listbox } from "../src/listbox"
import { Select } from "../src/select"

declare const labels: string[]
declare const setLabels: (labels: string[]) => void

// A list held in a variable types `multiple` as a list written out does.
;<Combobox
  multiple
  value={labels}
  onValueChange={(value) => setLabels(value)}
/>
;<Select multiple value={labels} onValueChange={(value) => setLabels(value)} />
;<Listbox multiple value={labels} onValueChange={(value) => setLabels(value)} />

declare const range: number[]
declare const setRange: (range: number[] | null) => void
declare const rangeItems: { value: number[]; label: string }[]

// A value that is itself a list takes its items or its type.
;<Select
  items={rangeItems}
  value={range}
  onValueChange={(value) => setRange(value)}
/>
;<Select<number[]> value={range} onValueChange={(value) => setRange(value)} />
