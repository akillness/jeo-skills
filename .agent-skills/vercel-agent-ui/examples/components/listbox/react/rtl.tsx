import { Listbox, ListboxItem } from "@ui-sdk/react/listbox"

const views = [
  { value: "day", label: "יום" },
  { value: "week", label: "שבוע" },
  { value: "month", label: "חודש" },
]

export function Example() {
  return (
    <div dir="rtl">
      <Listbox orientation="horizontal" defaultValue="day" aria-label="תצוגה">
        {views.map((view) => (
          <ListboxItem key={view.value} value={view.value}>
            {view.label}
          </ListboxItem>
        ))}
      </Listbox>
    </div>
  )
}
