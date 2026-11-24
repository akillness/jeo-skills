import { Listbox, ListboxItem } from "@ui-sdk/solid/listbox"
import { For } from "solid-js"

const views = [
  { value: "day", label: "יום" },
  { value: "week", label: "שבוע" },
  { value: "month", label: "חודש" },
]

export function Example() {
  return (
    <div dir="rtl">
      <Listbox orientation="horizontal" defaultValue="day" aria-label="תצוגה">
        <For each={views}>
          {(view) => <ListboxItem value={view.value}>{view.label}</ListboxItem>}
        </For>
      </Listbox>
    </div>
  )
}
