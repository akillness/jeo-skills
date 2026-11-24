import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/solid/tabs"
import { For } from "solid-js"

const ranges = [
  {
    value: "day",
    label: "Day",
    content: "128 visitors today, up 12% from yesterday.",
  },
  {
    value: "week",
    label: "Week",
    content: "1,024 visitors this week, up 8% from last week.",
  },
  {
    value: "month",
    label: "Month",
    content: "4,210 visitors this month, down 3% from last month.",
  },
  {
    value: "year",
    label: "Year",
    content: "48,930 visitors this year, up 21% from last year.",
  },
]

function Example() {
  return (
    <Tabs defaultValue="day" loop={false}>
      <TabsList aria-label="Range">
        <For each={ranges}>
          {(range) => <TabsTab value={range.value}>{range.label}</TabsTab>}
        </For>
      </TabsList>
      <For each={ranges}>
        {(range) => <TabsPanel value={range.value}>{range.content}</TabsPanel>}
      </For>
    </Tabs>
  )
}

export { Example }
